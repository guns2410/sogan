FROM node:lts-slim

WORKDIR /app

ADD dist /app/dist
ADD example/basic.js /app/example/basic.js
ADD package.json /app/package.json
ADD package-lock.json /app/package-lock.json

RUN npm install --production

CMD ["node", "example/basic.js"]