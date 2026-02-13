import { Injectable } from '@nestjs/common';
import { RedisService } from '../_common/redis/redis.service';
import {
  AiUsageAgg,
  AiUsageListResponse,
  AiUsageRecord,
  AiUsageRecordWithCost,
  ListAiUsageQuery,
} from './ai-usage.schema';
import { calculateModelCost } from './ai-model-pricing.config';

@Injectable()
export class AiUsageService {
  private readonly KEY_PREFIX = 'ai:usage:';
  private readonly ALL_IDS_KEY = 'ai:usage:all';

  private readonly MODELS_KEY = 'ai:usage:models:all';
  private readonly USERS_KEY = 'ai:usage:users:all';

  constructor(private readonly redis: RedisService) {}

  private getKey(id: string) {
    return `${this.KEY_PREFIX}${id}`;
  }

  private modelIndexKey(model: string) {
    return `ai:usage:model:${model}`;
  }
  private userIndexKey(userId: string) {
    return `ai:usage:user:${userId}`;
  }
  private kindIndexKey(kind: string) {
    return `ai:usage:kind:${kind}`;
  }

  private aggGlobalKey() {
    return `ai:usage:agg:global`;
  }
  private aggModelKey(model: string) {
    return `ai:usage:agg:model:${model}`;
  }
  private aggUserKey(userId: string) {
    return `ai:usage:agg:user:${userId}`;
  }
  private aggModelUserKey(model: string, userId: string) {
    return `ai:usage:agg:modeluser:${model}:${userId}`;
  }

  private makeId(): string {
    const ts = Date.now();
    const rnd = Math.random().toString(16).slice(2, 10);
    return `${ts}-${rnd}`;
  }

  private async getJsonArray(key: string): Promise<string[]> {
    const raw = await this.redis.get(key);
    return raw ? (JSON.parse(raw) as string[]) : [];
  }

  private async pushUnique(key: string, value: string): Promise<void> {
    if (!value) return;
    const arr = await this.getJsonArray(key);
    if (!arr.includes(value)) {
      arr.push(value);
      await this.redis.set(key, JSON.stringify(arr));
    }
  }

  private async pushId(key: string, id: string): Promise<void> {
    if (!id) return;
    const arr = await this.getJsonArray(key);
    arr.push(id);
    await this.redis.set(key, JSON.stringify(arr));
  }

  private async readAgg(key: string): Promise<AiUsageAgg> {
    const raw = await this.redis.get(key);
    if (raw) {
      const agg = JSON.parse(raw) as AiUsageAgg;
      // Calcula o custo se não estiver presente
      if (agg.costUsd === undefined) {
        // Para calcular o custo, precisamos do modelo, mas não temos aqui
        // O custo será calculado no summary quando necessário
      }
      return agg;
    }
    const now = new Date().toISOString();
    return {
      calls: 0,
      promptTokens: 0,
      completionTokens: 0,
      cachedTokens: 0,
      totalTokens: 0,
      updatedAt: now,
    };
  }

  private async bumpAgg(key: string, delta: Partial<AiUsageAgg>) {
    const cur = await this.readAgg(key);
    const next: AiUsageAgg = {
      calls: cur.calls + (delta.calls ?? 0),
      promptTokens: cur.promptTokens + (delta.promptTokens ?? 0),
      completionTokens: cur.completionTokens + (delta.completionTokens ?? 0),
      cachedTokens: cur.cachedTokens + (delta.cachedTokens ?? 0),
      totalTokens: cur.totalTokens + (delta.totalTokens ?? 0),
      updatedAt: new Date().toISOString(),
    };
    await this.redis.set(key, JSON.stringify(next));
  }

  async record(params: {
    kind: string;
    model: string;
    userId?: string;
    userName?: string;
    requestId?: string;
    callName?: string;
    promptTokens?: number;
    completionTokens?: number;
    cachedTokens?: number;
    totalTokens?: number;
  }): Promise<AiUsageRecord> {
    const id = this.makeId();
    const now = new Date().toISOString();

    const rec: AiUsageRecord = {
      id,
      kind: params.kind,
      model: params.model,
      userId: params.userId,
      userName: params.userName,
      requestId: params.requestId,
      callName: params.callName,
      promptTokens: params.promptTokens,
      completionTokens: params.completionTokens,
      cachedTokens: params.cachedTokens,
      totalTokens: params.totalTokens,
      createdAt: now,
    };

    await this.redis.set(this.getKey(id), JSON.stringify(rec));

    // índices (mesma lógica do redis-product: array JSON de IDs)
    await this.pushId(this.ALL_IDS_KEY, id);
    await this.pushId(this.kindIndexKey(params.kind), id);
    await this.pushId(this.modelIndexKey(params.model), id);
    if (params.userId) await this.pushId(this.userIndexKey(params.userId), id);

    await this.pushUnique(this.MODELS_KEY, params.model);
    if (params.userId) await this.pushUnique(this.USERS_KEY, params.userId);

    const delta = {
      calls: 1,
      promptTokens: params.promptTokens ?? 0,
      completionTokens: params.completionTokens ?? 0,
      cachedTokens: params.cachedTokens ?? 0,
      totalTokens: params.totalTokens ?? 0,
    };

    await this.bumpAgg(this.aggGlobalKey(), delta);
    await this.bumpAgg(this.aggModelKey(params.model), delta);
    if (params.userId)
      await this.bumpAgg(this.aggUserKey(params.userId), delta);
    if (params.userId)
      await this.bumpAgg(
        this.aggModelUserKey(params.model, params.userId),
        delta,
      );

    return rec;
  }

  async findAll(query: ListAiUsageQuery): Promise<AiUsageListResponse> {
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;
    const order = query.order ?? 'desc';

    let ids: string[] = [];

    if (query.model && query.userId) {
      const byModel = await this.getJsonArray(this.modelIndexKey(query.model));
      const byUser = await this.getJsonArray(this.userIndexKey(query.userId));
      const userSet = new Set(byUser);
      ids = byModel.filter((id) => userSet.has(id));
    } else if (query.model) {
      ids = await this.getJsonArray(this.modelIndexKey(query.model));
    } else if (query.userId) {
      ids = await this.getJsonArray(this.userIndexKey(query.userId));
    } else if (query.kind) {
      ids = await this.getJsonArray(this.kindIndexKey(query.kind));
    } else {
      ids = await this.getJsonArray(this.ALL_IDS_KEY);
    }

    // 1) carrega e filtra antes de paginar (para não distorcer total/totalCost)
    const filtered: AiUsageRecordWithCost[] = [];
    for (const id of ids) {
      const raw = await this.redis.get(this.getKey(id));
      if (!raw) continue;
      const rec = JSON.parse(raw) as AiUsageRecord;

      if (query.from && rec.createdAt < query.from) continue;
      if (query.to && rec.createdAt > query.to) continue;
      if (query.kind && rec.kind !== query.kind) continue;

      const cost = calculateModelCost(
        rec.model,
        rec.promptTokens,
        rec.completionTokens,
        rec.cachedTokens,
      );

      filtered.push({
        ...rec,
        costUsd: cost,
      });
    }

    // 2) ordena e pagina
    const ordered = order === 'desc' ? [...filtered].reverse() : [...filtered];
    const pageItems = ordered.slice(offset, offset + limit);

    // 3) agregados do conjunto filtrado (independente de paginação/ordem)
    const totals = filtered.reduce<{
      calls: number;
      promptTokens: number;
      completionTokens: number;
      cachedTokens: number;
      totalTokens: number;
      costUsd: number;
    }>(
      (acc, rec) => {
        acc.calls += 1;
        acc.promptTokens += rec.promptTokens ?? 0;
        acc.completionTokens += rec.completionTokens ?? 0;
        acc.cachedTokens += rec.cachedTokens ?? 0;

        const totalTokens =
          rec.totalTokens ??
          (rec.promptTokens ?? 0) + (rec.completionTokens ?? 0);
        acc.totalTokens += totalTokens;

        acc.costUsd += rec.costUsd ?? 0;

        return acc;
      },
      {
        calls: 0,
        promptTokens: 0,
        completionTokens: 0,
        cachedTokens: 0,
        totalTokens: 0,
        costUsd: 0,
      },
    );

    return {
      total: filtered.length,
      limit,
      offset,
      order,
      totalCostUsd: totals.costUsd,
      calls: totals.calls,
      promptTokens: totals.promptTokens,
      completionTokens: totals.completionTokens,
      cachedTokens: totals.cachedTokens,
      totalTokens: totals.totalTokens,
      costUsd: totals.costUsd,
      items: pageItems,
    };
  }

  private calculateAggCost(agg: AiUsageAgg, model?: string): number {
    if (!model) return 0;
    return calculateModelCost(
      model,
      agg.promptTokens,
      agg.completionTokens,
      agg.cachedTokens,
    );
  }

  private async calculateGlobalCost(): Promise<number> {
    const models = await this.getJsonArray(this.MODELS_KEY);
    let totalCost = 0;
    for (const m of models) {
      const agg = await this.readAgg(this.aggModelKey(m));
      totalCost += this.calculateAggCost(agg, m);
    }
    return totalCost;
  }

  async summary(query: {
    model?: string;
    userId?: string;
    kind?: string;
    topModels?: number;
    topUsers?: number;
  }) {
    const global = await this.readAgg(this.aggGlobalKey());
    const globalCost = await this.calculateGlobalCost();

    if (query.model && query.userId) {
      const model = await this.readAgg(this.aggModelKey(query.model));
      const user = await this.readAgg(this.aggUserKey(query.userId));
      const modelUser = await this.readAgg(
        this.aggModelUserKey(query.model, query.userId),
      );

      const modelCost = this.calculateAggCost(model, query.model);
      const modelUserCost = this.calculateAggCost(modelUser, query.model);

      return {
        global: {
          ...global,
          costUsd: globalCost,
        },
        model: { key: query.model, ...model, costUsd: modelCost },
        user: { key: query.userId, ...user, costUsd: 0 },
        modelUser: {
          model: query.model,
          userId: query.userId,
          ...modelUser,
          costUsd: modelUserCost,
        },
      };
    }

    if (query.model) {
      const model = await this.readAgg(this.aggModelKey(query.model));
      const modelCost = this.calculateAggCost(model, query.model);
      return {
        global: {
          ...global,
          costUsd: globalCost,
        },
        model: { key: query.model, ...model, costUsd: modelCost },
      };
    }

    if (query.userId) {
      const user = await this.readAgg(this.aggUserKey(query.userId));
      // Para usuário sem modelo específico, não podemos calcular custo exato
      // pois não sabemos qual modelo foi usado em cada chamada
      return {
        global: {
          ...global,
          costUsd: globalCost,
        },
        user: { key: query.userId, ...user, costUsd: 0 },
      };
    }

    const models = await this.getJsonArray(this.MODELS_KEY);
    const users = await this.getJsonArray(this.USERS_KEY);

    const byModel = [];
    for (const m of models) {
      const agg = await this.readAgg(this.aggModelKey(m));
      const cost = this.calculateAggCost(agg, m);
      byModel.push({ model: m, ...agg, costUsd: cost });
    }
    byModel.sort((a, b) => b.totalTokens - a.totalTokens);

    const byUser = [];
    for (const u of users) {
      const agg = await this.readAgg(this.aggUserKey(u));
      // Para usuário sem modelo específico, não podemos calcular custo exato
      byUser.push({ userId: u, ...agg, costUsd: 0 });
    }
    byUser.sort((a, b) => b.totalTokens - a.totalTokens);

    return {
      global: {
        ...global,
        costUsd: globalCost,
      },
      byModel: byModel.slice(0, query.topModels ?? 10),
      byUser: byUser.slice(0, query.topUsers ?? 10),
    };
  }
}
