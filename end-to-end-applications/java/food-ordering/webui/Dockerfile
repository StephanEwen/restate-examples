# pull official base image
FROM confluentinc/cp-kafka:7.5.0

# set working directory
WORKDIR /app

# add `/node_modules/.bin` to $PATH
ENV PATH /node_modules/.bin:$PATH

# install app dependencies
COPY package.json ./
COPY package-lock.json ./
RUN npm install

# add app
COPY . ./

EXPOSE 3000
# start app
CMD ["npm", "start"]
