const fs = require('fs')
const Q = require('kew')

const request = require('../Request')

let SymLoadBalancerConfigLoader = {};

const loadBalancingMethod = {
  RANDOM: 'random',
  ROUNDROBIN: 'roundrobin',
  EXTERNAL: 'external'
};

SymLoadBalancerConfigLoader.loadFromFile = (path, SymConfig) => {
  let defer = Q.defer()

  fs.readFile(path, function (err, data) {
    if (err) {
      defer.reject(err)
      return
    }

    let config
    try {
      config = JSON.parse(data)
    } catch (err) {
      defer.reject(err)
      return
    }

    enhanceSymConfig(config, SymConfig);
    SymConfig.getAgentHost = getAgentHost;
    SymConfig.rotateAgent = rotateAgent;
    SymConfig.getActualAgentHost = getActualAgentHost;

    defer.resolve(SymConfig)
  })

  return defer.promise
}

function enhanceSymConfig(configFromFile, SymConfig) {
  SymConfig.currentAgentIndex = -1;
  SymConfig.actualAgentHost = '';

  SymConfig.loadBalancing = configFromFile.loadBalancing;
  SymConfig.agentServers = configFromFile.agentServers;
}

function getAgentHost() {
  let isSticky = this.loadBalancing.stickySessions;

  switch (this.loadBalancing.method) {
    case loadBalancingMethod.RANDOM:
      if (this.currentAgentIndex === -1 || !isSticky) {
        this.rotateAgent();
      }
      this.agentHost = this.agentServers[this.currentAgentIndex];
      break;
    case loadBalancingMethod.ROUNDROBIN:
      if (this.currentAgentIndex === -1) {
        this.currentAgentIndex++;
      }
      this.agentHost = this.agentServers[this.currentAgentIndex];
      if (!isSticky) {
        this.rotateAgent();
      }
      break;
    case loadBalancingMethod.EXTERNAL:
      if (!this.actualAgentHost || !isSticky) {
        this.rotateAgent();
      }
      this.agentHost = this.actualAgentHost;
      break;
  }
  return this.agentHost;
}

function rotateAgent() {
  switch (this.loadBalancing.method) {
    case loadBalancingMethod.RANDOM:
      this.currentAgentIndex = getRandomInt(0, this.agentServers.length - 1);
      break;
    case loadBalancingMethod.ROUNDROBIN:
      this.currentAgentIndex++;
      if (this.currentAgentIndex === this.agentServers.length) {
        this.currentAgentIndex = 0;
      }
      break;
    case loadBalancingMethod.EXTERNAL:
      this.actualAgentHost = this.getActualAgentHost();
      break;
  }
}

function getActualAgentHost() {
  const externalAgentHost = (this.agentServers && this.agentServers.length > 0) ?
    this.agentServers[0] : this.getAgentHost();

  const options = {
    hostname: externalAgentHost,
    port: this.agentPort,
    path: `/gethost`,
    method: 'GET'
  }

  return request(options, 'SymLoadBalancerConfigLoader/getActualAgentHost', null, true).then(response =>
    Buffer.from(response.body, 'base64')//TODO: fqdn?
  )
}

function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

module.exports = SymLoadBalancerConfigLoader