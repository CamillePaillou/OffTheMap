# Image de développement : le code est monté en volume par docker-compose.yml.
FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./
# Les scripts d'installation ne servent qu'à l'hôte (binaire de la CLI Supabase).
RUN npm ci --ignore-scripts

COPY . .

EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0"]
