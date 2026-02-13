import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

// Importar entidades
import { SensitiveField } from '../src/privacy/sensitive-field.entity';
import { Company } from '../src/administration/company/company.entity';

// Configurar DataSource
const dataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  synchronize: false,
  logging: true,
  entities: [SensitiveField, Company],
});

async function ensureSensitiveFields() {
  const sensitiveFieldRepository = dataSource.getRepository(SensitiveField);
  const companyRepository = dataSource.getRepository(Company);

  // Buscar a primeira empresa (assumindo que existe pelo menos uma)
  const company = await companyRepository.findOne({ where: { deletedAt: null } });
  if (!company) {
    throw new Error('Nenhuma empresa encontrada. Execute o seed principal primeiro.');
  }

  const sensitiveFields = [
    {
      entity: 'User',
      field: 'email',
      moduleName: 'users',
      label: 'E-mail',
      description: 'Endereço de e-mail do usuário',
      readRule: 'users.read.pii',
      writeRule: 'users.update',
      active: true,
      companyId: company.id,
    },
    {
      entity: 'User',
      field: 'phone',
      moduleName: 'users',
      label: 'Telefone',
      description: 'Número de telefone do usuário',
      readRule: 'users.read.pii',
      writeRule: 'users.update',
      active: true,
      companyId: company.id,
    },
    {
      entity: 'User',
      field: 'cpf',
      moduleName: 'users',
      label: 'CPF',
      description: 'CPF do usuário',
      readRule: 'users.read.pii',
      writeRule: 'users.update',
      active: true,
      companyId: company.id,
    },
    {
      entity: 'User',
      field: 'birthdate',
      moduleName: 'users',
      label: 'Data de Nascimento',
      description: 'Data de nascimento do usuário',
      readRule: 'users.read.pii',
      writeRule: 'users.update',
      active: true,
      companyId: company.id,
    },
    {
      entity: 'User',
      field: 'password',
      moduleName: 'users',
      label: 'Senha',
      description: 'Senha do usuário (nunca deve ser retornada)',
      readRule: null, // Nunca deve ser lida
      writeRule: 'users.update',
      active: true,
      companyId: company.id,
    },
  ];

  for (const fieldData of sensitiveFields) {
    const existing = await sensitiveFieldRepository.findOne({
      where: {
        entity: fieldData.entity,
        field: fieldData.field,
        companyId: fieldData.companyId,
      },
    });

    if (!existing) {
      const sensitiveField = sensitiveFieldRepository.create(fieldData);
      await sensitiveFieldRepository.save(sensitiveField);
      console.log(`✅ Campo sensível criado: ${fieldData.entity}.${fieldData.field}`);
    } else {
      console.log(`⚠️  Campo sensível já existe: ${fieldData.entity}.${fieldData.field}`);
    }
  }
}

async function main() {
  try {
    console.log('🔒 Iniciando configuração de campos sensíveis...');

    // Conectar ao banco
    await dataSource.initialize();
    console.log('✅ Conectado ao banco de dados');

    // Configurar campos sensíveis
    await ensureSensitiveFields();

    console.log('🎉 Configuração de campos sensíveis concluída!');

  } catch (error) {
    console.error('❌ Configuração falhou:', error);
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
