FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
# O build só enxerga a pasta app/ (código). Dados pessoais ficam em local/, fora do alcance do build:
# nada de .env, banco, planilhas ou backups entra na imagem.
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
