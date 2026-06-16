FROM node:20-alpine

WORKDIR /app

# Copy dependency structures and install packages
COPY package*.json ./
RUN npm install

# Copy application source code
COPY . .

EXPOSE 3000

CMD ["npm", "start"]
