FROM node:20-bullseye

WORKDIR /app

RUN apt-get update && apt-get install -y \
    build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
    graphicsmagick ghostscript \
 && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm install

COPY . .

RUN rm -rf .next
RUN npm run build

EXPOSE 8080

CMD ["npm", "start"]