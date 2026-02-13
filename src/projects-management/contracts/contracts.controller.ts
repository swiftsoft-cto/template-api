import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UsePipes,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { StreamableFile } from '@nestjs/common';
import { ZodValidationPipe } from '../../_common/pipes/zod-validation.pipe';
import { Authz } from '../../auth/decorators/rule.decorator';
import { User } from '../../_common/decorators/user.decorator';
import { ContractsService } from './contracts.service';
import {
  CreateContractBody,
  CreateContractTemplateBody,
  ListContractsQuery,
  ListContractTemplatesQuery,
  UpdateContractBody,
  UpdateContractTemplateBody,
  PreviewContractBody,
} from './contracts.schema';

@UsePipes(ZodValidationPipe)
@Controller('contracts')
export class ContractsController {
  constructor(private readonly svc: ContractsService) {}

  // ---------------- Templates ----------------
  @Authz('projects-management.contracts.templates.read')
  @Get('templates')
  listTemplates(@Query() q: ListContractTemplatesQuery) {
    return this.svc.listTemplates(q as any);
  }

  @Authz('projects-management.contracts.templates.create')
  @Post('templates')
  createTemplate(
    @Body() dto: CreateContractTemplateBody,
    @User('userId') userId: string,
  ) {
    return this.svc.createTemplate(dto as any, userId);
  }

  @Authz('projects-management.contracts.templates.read')
  @Get('templates/:id')
  findTemplate(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.svc.findOneTemplate(id);
  }

  @Authz('projects-management.contracts.templates.update')
  @Patch('templates/:id')
  updateTemplate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateContractTemplateBody,
  ) {
    return this.svc.updateTemplate(id, dto as any);
  }

  @Authz('projects-management.contracts.templates.delete')
  @Delete('templates/:id')
  removeTemplate(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.svc.removeTemplate(id);
  }

  // ---------------- Contracts ----------------
  @Authz('projects-management.contracts.read')
  @Get()
  listContracts(@Query() q: ListContractsQuery) {
    return this.svc.listContracts(q as any);
  }

  @Authz('projects-management.contracts.preview.create')
  @Post('preview')
  previewContract(@Body() dto: PreviewContractBody) {
    return this.svc.previewContract(dto as any);
  }

  @Authz('projects-management.contracts.create')
  @Post()
  createContract(
    @Body() dto: CreateContractBody,
    @User('userId') userId: string,
  ) {
    return this.svc.createContract(dto as any, userId);
  }

  @Authz('projects-management.contracts.download.read')
  @Get(':id/docx')
  async downloadContractDocx(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const buffer = await this.svc.exportContractToDocx(id);
    const contract = await this.svc.findOneContract(id);
    const filename = contract.title
      ? `${contract.title.replace(/[^a-z0-9]/gi, '_')}.docx`
      : `contrato_${id}.docx`;

    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });

    return new StreamableFile(buffer);
  }

  @Authz('projects-management.contracts.download.read')
  @Get(':id/pdf')
  async downloadContractPdf(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const buffer = await this.svc.exportContractToPdf(id);
    const contract = await this.svc.findOneContract(id);
    const filename = contract.title
      ? `${contract.title.replace(/[^a-z0-9]/gi, '_')}.pdf`
      : `contrato_${id}.pdf`;

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });

    return new StreamableFile(buffer);
  }

  @Authz('projects-management.contracts.read')
  @Get(':id')
  findContract(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.svc.findOneContract(id);
  }

  @Authz('projects-management.contracts.update')
  @Patch(':id')
  updateContract(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateContractBody,
  ) {
    return this.svc.updateContract(id, dto as any);
  }

  @Authz('projects-management.contracts.delete')
  @Delete(':id')
  removeContract(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.svc.removeContract(id);
  }

  // ---------------- Webhooks ----------------
  @Post('webhook/autentique')
  @HttpCode(HttpStatus.OK)
  // Nota: Este endpoint não usa @Authz pois webhooks são validados via HMAC
  async autentiqueWebhook(
    @Body() body: any,
    @Headers('x-autentique-signature') signature: string | undefined,
    @Req() req: Request,
  ) {
    console.log('🔔 Webhook Autentique recebido:', {
      timestamp: new Date().toISOString(),
      eventType: body?.event?.type,
      documentId: body?.event?.data?.document || body?.event?.data?.id,
      signatureHeader: signature,
      signatureLength: signature?.length,
    });

    const secret = process.env.AUTENTIQUE_WEBHOOK_SECRET;
    console.log(
      '🔑 Secret configurado:',
      secret ? `SIM (length: ${secret.length})` : 'NÃO',
    );

    if (!secret) {
      throw new UnauthorizedException('Webhook secret not configured');
    }

    // Tenta usar o raw body se disponível (req.body pode ter sido parseado)
    // Para webhooks HMAC, geralmente precisa do body original antes do parsing
    // Se não disponível, usa JSON.stringify com ordenação determinística
    let payload: string;
    if ((req as any).rawBody) {
      payload = (req as any).rawBody.toString('utf8');
      console.log('📦 Usando rawBody da requisição');
    } else {
      // Fallback: serialização JSON determinística (sem espaços, ordem fixa)
      payload = JSON.stringify(body);
      console.log(
        '📦 Usando JSON.stringify (pode não corresponder exatamente ao formato original)',
      );
    }

    // Verifica assinatura HMAC
    if (!this.svc.verifyAutentiqueSignature(signature, payload, secret)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    // Processa o webhook de forma assíncrona (retorna rápido)
    // Importante: retornar 200 rapidamente antes de processar
    setImmediate(async () => {
      try {
        await this.svc.handleAutentiqueWebhook(body);
      } catch (error: any) {
        // Log do erro mas não falha a requisição
        console.error('Error processing Autentique webhook:', error);
      }
    });

    return { message: 'Webhook received' };
  }
}
