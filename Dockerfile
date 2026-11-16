FROM node:22-slim
WORKDIR /app
COPY . .
ARG GIT_SHA=yerel
ENV NODE_ENV=production GIT_SHA=$GIT_SHA DATA_DIR=/data PORT=3000
RUN mkdir -p /data && chown -R node:node /data /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:3000/api/saglik').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","--no-warnings","server.js"]
