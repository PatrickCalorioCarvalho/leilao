CREATE TABLE IF NOT EXISTS leilao (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(120) NOT NULL,
  data DATE NULL,
  beneficiario VARCHAR(200) NOT NULL DEFAULT '',
  cidade VARCHAR(100) NOT NULL DEFAULT '',
  vencimento DATE NULL,
  cnpj VARCHAR(30) NOT NULL DEFAULT '',
  endereco_entidade VARCHAR(300) NOT NULL DEFAULT '',
  telefone_entidade VARCHAR(60) NOT NULL DEFAULT '',
  link_nuvem VARCHAR(600) NOT NULL DEFAULT '',   -- link de envio do OneDrive/Drive (opcional)
  ativo TINYINT NOT NULL DEFAULT 0,
  historico TINYINT NOT NULL DEFAULT 0   -- 1 = só consulta (somente leitura)
) DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pessoa (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(200) NOT NULL,
  cpf VARCHAR(20) NOT NULL DEFAULT '',
  rg VARCHAR(30) NOT NULL DEFAULT '',
  telefone VARCHAR(40) NOT NULL DEFAULT '',
  endereco VARCHAR(300) NOT NULL DEFAULT '',
  KEY ix_pessoa_nome (nome)
) DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS lote (
  id INT AUTO_INCREMENT PRIMARY KEY,
  leilao_id INT NOT NULL,
  numero INT NOT NULL,
  sub INT NOT NULL DEFAULT 0,            -- 0 = lote normal; 1 = "100-1" (reaberto após doação)
  descricao VARCHAR(200) NOT NULL,
  animal_num VARCHAR(30) NOT NULL DEFAULT '',
  condicao VARCHAR(10) NOT NULL DEFAULT '',   -- '', 'vivo' ou 'morto'
  valor_inicial DECIMAL(12,2) NOT NULL DEFAULT 0,
  doado TINYINT NOT NULL DEFAULT 0,
  pessoa_id INT NULL,
  valor_final DECIMAL(12,2) NULL,
  UNIQUE KEY uq_lote (leilao_id, numero, sub),
  CONSTRAINT fk_lote_leilao FOREIGN KEY (leilao_id) REFERENCES leilao(id),
  CONSTRAINT fk_lote_pessoa FOREIGN KEY (pessoa_id) REFERENCES pessoa(id)
) DEFAULT CHARSET=utf8mb4;
