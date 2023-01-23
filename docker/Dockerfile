#
# docker image build -t iexechub/netstats:1.0.0 .
#

FROM node:16-alpine

WORKDIR /eth-netstats

RUN npm install -g grunt-cli

COPY ../package.json /eth-netstats/package.json

RUN npm install

COPY . /eth-netstats/

RUN grunt

ENTRYPOINT [ "npm", "start" ]
