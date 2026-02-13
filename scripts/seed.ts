import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import * as dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

// Importar entidades
import { Company } from '../src/administration/company/company.entity';
import { User } from '../src/administration/users/user.entity';
import { Rule } from '../src/administration/rules/rule.entity';
import { Role } from '../src/administration/roles/role.entity';
import { UserRule } from '../src/administration/users/user-rule.entity';
import { Department } from '../src/administration/departments/department.entity';
import { DepartmentRole } from '../src/administration/departments/department-role.entity';
import { RoleRule } from '../src/administration/roles/role-rule.entity';
import { RefreshToken } from '../src/auth/refresh-token.entity';
import {
  Customer,
  CustomerPerson,
  CustomerCompany,
  CustomerBranch,
  Address,
  CompanyPersonLink
} from '../src/administration/customers/entities';

// Configurar DataSource
const dataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  synchronize: false, // Não usar synchronize no seed
  logging: true,
  entities: [
    Company,
    User,
    Rule,
    Role,
    UserRule,
    Department,
    DepartmentRole,
    RoleRule,
    RefreshToken,
    Customer,
    CustomerPerson,
    CustomerCompany,
    CustomerBranch,
    Address,
    CompanyPersonLink,
  ],
});

async function upsertRules() {
  const SUPER_RULE = process.env.SUPER_RULE ?? 'administrator';

  const basicRules = [
    { name: SUPER_RULE, description: 'Super regra - bypass total' },

    // ========== Administration - Users ==========
    { name: 'users.read', description: 'Visualizar usuários' },
    { name: 'users.read.pii', description: 'Visualizar dados sensíveis (PII) de usuários' },
    { name: 'users.write.pii', description: 'Modificar dados sensíveis (PII) de usuários' },
    { name: 'users.create', description: 'Criar usuários' },
    { name: 'users.update', description: 'Editar usuários' },
    { name: 'users.delete', description: 'Excluir usuários' },
    { name: 'users.link_role', description: 'Vincular roles a usuários' },
    { name: 'users.unlink_role', description: 'Desvincular roles de usuários' },
    { name: 'users.block_access', description: 'Bloquear acesso de usuários' },
    { name: 'users.unblock_access', description: 'Desbloquear acesso de usuários' },
    { name: 'users.avatar.read', description: 'Visualizar avatar de usuários' },
    { name: 'users.avatar.update', description: 'Atualizar avatar de usuários' },
    { name: 'users.role.read', description: 'Visualizar role de um usuário' },
    { name: 'users.role.update', description: 'Atualizar role de um usuário' },
    { name: 'users.role.delete', description: 'Remover role de um usuário' },

    // ========== Administration - Roles ==========
    { name: 'roles.read', description: 'Visualizar roles' },
    { name: 'roles.create', description: 'Criar roles' },
    { name: 'roles.update', description: 'Editar roles' },
    { name: 'roles.delete', description: 'Excluir roles' },
    { name: 'roles.users.read', description: 'Visualizar usuários de um role' },
    { name: 'roles.rules.read', description: 'Visualizar regras de um role' },
    { name: 'roles.rules.create', description: 'Adicionar regra a um role' },
    { name: 'roles.rules.delete', description: 'Remover regra de um role' },
    { name: 'roles.departments.read', description: 'Visualizar departamentos de um role' },
    { name: 'roles.departments.create', description: 'Vincular departamento a um role' },
    { name: 'roles.departments.delete', description: 'Desvincular departamento de um role' },

    // ========== Administration - Departments ==========
    { name: 'departments.read', description: 'Visualizar departamentos' },
    { name: 'departments.create', description: 'Criar departamentos' },
    { name: 'departments.update', description: 'Editar departamentos' },
    { name: 'departments.delete', description: 'Excluir departamentos' },
    { name: 'departments.roles.read', description: 'Visualizar roles de um departamento' },
    { name: 'departments.roles.create', description: 'Vincular role a um departamento' },
    { name: 'departments.roles.delete', description: 'Desvincular role de um departamento' },

    // ========== Administration - Rules ==========
    { name: 'rules.read', description: 'Visualizar regras' },

    // ========== Administration - Company ==========
    { name: 'company.read', description: 'Visualizar dados da empresa' },
    { name: 'company.update', description: 'Editar dados da empresa' },

    // ========== Administration - Customers ==========
    { name: 'customers.read', description: 'Visualizar clientes' },
    { name: 'customers.create', description: 'Criar clientes' },
    { name: 'customers.update', description: 'Editar clientes' },
    { name: 'customers.delete', description: 'Excluir clientes' },
    { name: 'customers.company.update', description: 'Atualizar dados da empresa do cliente' },
    { name: 'customers.addresses.read', description: 'Visualizar endereços de clientes' },
    { name: 'customers.addresses.create', description: 'Criar endereços de clientes' },
    { name: 'customers.addresses.update', description: 'Editar endereços de clientes' },
    { name: 'customers.addresses.delete', description: 'Excluir endereços de clientes' },
    { name: 'customers.people.read', description: 'Visualizar pessoas vinculadas a empresas' },
    { name: 'customers.people.create', description: 'Vincular pessoa a empresa' },
    { name: 'customers.people.delete', description: 'Desvincular pessoa de empresa' },
    { name: 'customers.branches.read', description: 'Visualizar filiais de clientes' },
    { name: 'customers.branches.create', description: 'Criar ou vincular filiais de clientes' },
    { name: 'customers.branches.delete', description: 'Excluir filiais de clientes' },

    // ========== Projects Management - Projects ==========
    { name: 'projects.read', description: 'Visualizar projetos' },
    { name: 'projects.create', description: 'Criar projetos' },
    { name: 'projects.update', description: 'Editar projetos' },
    { name: 'projects.delete', description: 'Excluir projetos' },
    { name: 'projects.manager', description: 'Gerenciar projetos (recebe notificações)' },

    // ========== Projects Management - Contracts ==========
    { name: 'projects-management.contracts.read', description: 'Visualizar contratos' },
    { name: 'projects-management.contracts.create', description: 'Criar contratos' },
    { name: 'projects-management.contracts.update', description: 'Editar contratos' },
    { name: 'projects-management.contracts.delete', description: 'Excluir contratos' },
    { name: 'projects-management.contracts.download.read', description: 'Baixar contratos (PDF/DOCX)' },
    { name: 'projects-management.contracts.preview.create', description: 'Gerar preview de contratos' },
    { name: 'projects-management.contracts.templates.read', description: 'Visualizar templates de contratos' },
    { name: 'projects-management.contracts.templates.create', description: 'Criar templates de contratos' },
    { name: 'projects-management.contracts.templates.update', description: 'Editar templates de contratos' },
    { name: 'projects-management.contracts.templates.delete', description: 'Excluir templates de contratos' },

    // ========== Projects Management - Scope ==========
    { name: 'projects-management.scopes.read', description: 'Visualizar escopos de projeto' },
    { name: 'projects-management.scopes.create', description: 'Criar escopos de projeto' },
    { name: 'projects-management.scopes.update', description: 'Editar escopos de projeto' },
    { name: 'projects-management.scopes.delete', description: 'Excluir escopos de projeto' },

    // ========== Privacy - Sensitive Fields ==========
    { name: 'privacy.sensitive-fields.read', description: 'Visualizar campos sensíveis' },
    { name: 'privacy.sensitive-fields.create', description: 'Criar campos sensíveis' },
    { name: 'privacy.sensitive-fields.update', description: 'Editar campos sensíveis' },
    { name: 'privacy.sensitive-fields.delete', description: 'Excluir campos sensíveis' },

    // ========== Notifications ==========
    { name: 'notifications.read', description: 'Visualizar notificações' },
    { name: 'notifications.create', description: 'Criar notificações' },
    { name: 'notifications.update', description: 'Atualizar notificações (marcar como lida)' },
    { name: 'notifications.delete', description: 'Excluir notificações' },

    // ========== Transcriptions ==========
    { name: 'transcriptions.read', description: 'Visualizar transcrições, mídia, insights e compartilhamentos' },
    { name: 'transcriptions.create', description: 'Criar transcrições, tags, insights e links de compartilhamento' },
    { name: 'transcriptions.update', description: 'Editar transcrições' },
    { name: 'transcriptions.delete', description: 'Excluir transcrições, tags e revogar links de compartilhamento' },

    // ========== Transcriptions - Chat ==========
    { name: 'transcriptions.chat.read', description: 'Visualizar threads e mensagens do chat' },
    { name: 'transcriptions.chat.create', description: 'Enviar mensagens no chat' },
    { name: 'transcriptions.chat.delete', description: 'Excluir threads do chat' },

    // ========== Transcriptions - Comments ==========
    { name: 'transcriptions.comments.read', description: 'Visualizar comentários' },
    { name: 'transcriptions.comments.create', description: 'Criar comentários' },
    { name: 'transcriptions.comments.update', description: 'Editar comentários' },
    { name: 'transcriptions.comments.delete', description: 'Excluir comentários' },

    // ========== Transcriptions - Summaries ==========
    { name: 'transcriptions.summaries.read', description: 'Visualizar resumos' },
    { name: 'transcriptions.summaries.create', description: 'Gerar resumos' },

    // ========== Transcription Shares (compartilhar com usuários) ==========
    { name: 'transcription_shares.create', description: 'Compartilhar transcrição com outros usuários' },
    { name: 'transcription_shares.read', description: 'Visualizar usuários com quem a transcrição está compartilhada' },
    { name: 'transcription_shares.delete', description: 'Remover compartilhamento de transcrição' },

    // ========== AI - Usage ==========
    { name: 'ai.usage.read', description: 'Visualizar uso de IA' },

    // ========== Financial Categories (mantidas para compatibilidade) ==========
    { name: 'financial.categories.read', description: 'Visualizar categorias financeiras' },
    { name: 'financial.categories.manage', description: 'Gerenciar categorias financeiras (criar, editar, excluir)' },

    // ========== Financial Subcategories (mantidas para compatibilidade) ==========
    { name: 'financial.subcategories.read', description: 'Visualizar subcategorias financeiras' },
    { name: 'financial.subcategories.manage', description: 'Gerenciar subcategorias financeiras (criar, editar, excluir)' },

    // ========== AI Pieces (mantidas para compatibilidade) ==========
    { name: 'ai.pieces.read', description: 'Visualizar peças de IA' },
    { name: 'ai.pieces.manage', description: 'Gerenciar peças de IA (criar, editar, excluir)' },

    // ========== AI Rules (mantidas para compatibilidade) ==========
    { name: 'ai.rules.read', description: 'Visualizar regras de IA' },
    { name: 'ai.rules.manage', description: 'Gerenciar regras de IA (criar, editar, excluir)' },

    // ========== AI Topics (mantidas para compatibilidade) ==========
    { name: 'ai.topics.read', description: 'Visualizar tópicos de IA' },
    { name: 'ai.topics.manage', description: 'Gerenciar tópicos de IA (criar, editar, excluir)' },
  ];

  const ruleRepository = dataSource.getRepository(Rule);

  for (const ruleData of basicRules) {
    let rule = await ruleRepository.findOne({ where: { name: ruleData.name } });

    if (!rule) {
      rule = ruleRepository.create({
        id: uuidv4(),
        name: ruleData.name,
        description: ruleData.description,
      });
      await ruleRepository.save(rule);
      console.log(`📋 Rule criada: ${rule.name}`);
    } else if (rule.deletedAt) {
      rule.deletedAt = null;
      rule.description = ruleData.description;
      await ruleRepository.save(rule);
      console.log(`📋 Rule restaurada: ${rule.name}`);
    } else {
      rule.description = ruleData.description;
      await ruleRepository.save(rule);
      console.log(`📋 Rule atualizada: ${rule.name}`);
    }
  }

  return { SUPER_RULE };
}

async function ensureCompany() {
  const name = process.env.SEED_COMPANY_NAME ?? 'Empresa Padrão';
  const tradeName = process.env.SEED_COMPANY_TRADENAME ?? 'Empresa Padrão';
  const email = process.env.SEED_COMPANY_EMAIL ?? 'contato@empresa.local';

  const companyRepository = dataSource.getRepository(Company);

  let company = await companyRepository.findOne({ where: { name } });

  if (!company) {
    company = companyRepository.create({
      id: uuidv4(),
      name,
      tradeName,
      email,
    });
    await companyRepository.save(company);
    console.log(`🏢 Empresa criada: ${company.name}`);
  } else if (company.deletedAt) {
    company.deletedAt = null;
    company.tradeName = tradeName;
    company.email = email;
    await companyRepository.save(company);
    console.log(`🏢 Empresa restaurada: ${company.name}`);
  } else {
    company.tradeName = tradeName;
    company.email = email;
    await companyRepository.save(company);
    console.log(`🏢 Empresa atualizada: ${company.name}`);
  }

  return company;
}

async function ensureSuperRole(company: Company, SUPER_RULE: string) {
  const roleRepository = dataSource.getRepository(Role);

  let superRole = await roleRepository.findOne({
    where: {
      companyId: company.id,
      name: 'Administrador'
    }
  });

  if (!superRole) {
    superRole = roleRepository.create({
      id: uuidv4(),
      companyId: company.id,
      name: 'Administrador',
      description: 'Função com acesso total ao sistema',
    });
    await roleRepository.save(superRole);
    console.log(`👑 Super Função criada: ${superRole.name}`);
  } else if (superRole.deletedAt) {
    superRole.deletedAt = null;
    await roleRepository.save(superRole);
    console.log(`👑 Super Função restaurada: ${superRole.name}`);
  } else {
    console.log(`👑 Super Função já existe: ${superRole.name}`);
  }

  return superRole;
}

async function linkSuperRoleToRules(superRole: Role, SUPER_RULE: string) {
  const ruleRepository = dataSource.getRepository(Rule);
  const roleRuleRepository = dataSource.getRepository(RoleRule);

  // Buscar todas as regras
  const allRules = await ruleRepository.find({ where: { deletedAt: null } });

  for (const rule of allRules) {
    const existingLink = await roleRuleRepository.findOne({
      where: {
        roleId: superRole.id,
        ruleId: rule.id,
      }
    });

    if (!existingLink) {
      const roleRule = roleRuleRepository.create({
        roleId: superRole.id,
        ruleId: rule.id,
      });
      await roleRuleRepository.save(roleRule);
      console.log(`🔗 Permissão vinculada à Super Função: ${rule.name}`);
    }
  }
}

async function ensureSuperUser(company: Company, superRole: Role) {
  const name = process.env.SEED_SUPER_USER_NAME ?? 'João da Silva';
  const email = process.env.SEED_SUPER_USER_EMAIL ?? 'hms.swiftsoft@gmail.com';
  const password = process.env.SEED_SUPER_USER_PASSWORD ?? 'Admin@123456!';

  const userRepository = dataSource.getRepository(User);

  let superUser = await userRepository.findOne({ where: { email } });

  if (!superUser) {
    const hashedPassword = await bcrypt.hash(password, 10);

    superUser = userRepository.create({
      id: uuidv4(),
      name,
      email,
      password: hashedPassword,
      companyId: company.id,
      roleId: superRole.id,
      emailVerifiedAt: new Date(),
    });

    await userRepository.save(superUser);
    console.log(`👤 Super User criado: ${superUser.name} (${superUser.email})`);
  } else if (superUser.deletedAt) {
    superUser.deletedAt = null;
    superUser.companyId = company.id;
    superUser.roleId = superRole.id;
    await userRepository.save(superUser);
    console.log(`👤 Super User restaurado: ${superUser.name} (${superUser.email})`);
  } else {
    superUser.companyId = company.id;
    superUser.roleId = superRole.id;
    await userRepository.save(superUser);
    console.log(`👤 Super User atualizado: ${superUser.name} (${superUser.email})`);
  }

  return superUser;
}

async function ensureDefaultDepartment(company: Company) {
  const departmentRepository = dataSource.getRepository(Department);

  let defaultDept = await departmentRepository.findOne({
    where: {
      companyId: company.id,
      name: 'Geral'
    }
  });

  if (!defaultDept) {
    defaultDept = departmentRepository.create({
      id: uuidv4(),
      companyId: company.id,
      name: 'Geral',
      description: 'Departamento padrão da empresa',
    });
    await departmentRepository.save(defaultDept);
    console.log(`🏢 Departamento criado: ${defaultDept.name}`);
  } else if (defaultDept.deletedAt) {
    defaultDept.deletedAt = null;
    await departmentRepository.save(defaultDept);
    console.log(`🏢 Departamento restaurado: ${defaultDept.name}`);
  } else {
    console.log(`🏢 Departamento já existe: ${defaultDept.name}`);
  }

  return defaultDept;
}

async function main() {
  try {
    console.log('🌱 Iniciando seed do banco de dados...');

    // Conectar ao banco
    await dataSource.initialize();
    console.log('✅ Conectado ao banco de dados');

    // 1. Criar/atualizar regras (incluindo as novas de projects)
    console.log('\n📋 Criando/atualizando regras...');
    const { SUPER_RULE } = await upsertRules();

    // 2. Criar/atualizar empresa
    console.log('\n🏢 Criando/atualizando empresa...');
    const company = await ensureCompany();

    // 3. Criar/atualizar role de administrador
    console.log('\n👑 Criando/atualizando role de administrador...');
    const superRole = await ensureSuperRole(company, SUPER_RULE);

    // 4. Vincular todas as regras à role de administrador
    console.log('\n🔗 Vinculando regras à role de administrador...');
    await linkSuperRoleToRules(superRole, SUPER_RULE);

    // 5. Criar/atualizar usuário administrador
    console.log('\n👤 Criando/atualizando usuário administrador...');
    await ensureSuperUser(company, superRole);

    // 6. Criar/atualizar departamento padrão
    console.log('\n🏢 Criando/atualizando departamento padrão...');
    await ensureDefaultDepartment(company);

    console.log('\n🎉 Seed concluído com sucesso!');

  } catch (error) {
    console.error('❌ Erro ao executar seed:', error);
    process.exit(1);
  } finally {
    // Fechar conexão
    if (dataSource.isInitialized) {
      await dataSource.destroy();
      console.log('🔌 Conexão com banco fechada');
    }
  }
}

// Executar apenas se chamado diretamente
if (require.main === module) {
  main();
}