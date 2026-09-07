# Serviço Pluggy (connect-token + webhook) para o EasyPanel.
# Imagem enxuta; sem dependências externas (fetch e http nativos do Node).
FROM node:22-alpine

WORKDIR /app
COPY package.json ./
COPY server.mjs ./

# O EasyPanel injeta PORT e as variáveis de ambiente (Environment do App).
ENV PORT=8790
EXPOSE 8790

# Healthcheck bate em /health.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:${PORT}/health || exit 1

CMD ["node", "server.mjs"]
