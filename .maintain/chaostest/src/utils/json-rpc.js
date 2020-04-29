const request = require('request')

const getChainBlockHeight = (url, port) => new Promise((resolve, reject) => {
  let options = {
    url: url + ':' + port,
    method: 'post',
    headers:
	{'content-type': 'application/json'},
    body: JSON.stringify({id: 1, jsonrpc: '2.0', method: 'chain_getBlock'}),
  }

  request(options, (error, _response, body) => {
    if (error) {
      console.log('errror requesting jsonRPC', error)
      reject(error)
    } else {
      const data = JSON.parse(body)
      const height = parseInt(data.result.block.header.number, 16) // simply parse scale integer to decimal to compare
      resolve(height)
    }
  })
})

module.exports = {getChainBlockHeight}
