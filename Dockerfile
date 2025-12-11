FROM node:lts as build
LABEL authors="flexusma, onesrv"

COPY . .
RUN npm i && npm install typescript -g
RUN tsc

FROM node:lts-alpine as deploy
COPY --from=build ./ /app
WORKDIR /app

ENTRYPOINT ["node", "./dist/index.js"]