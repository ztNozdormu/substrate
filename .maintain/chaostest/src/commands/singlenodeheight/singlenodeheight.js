const {Command, flags} = require('@oclif/command')

class SingleNodeHeightCommand extends Command {
  async run() {
    const {flags} = this.parse(SingleNodeHeightCommand)
    const imageTag = flags.image || 'parity/substrate:2.0.0-31c633c47'
    const port = flags.port || 9933
    const url = flags.url || 'http://localhost'
    const wait = flags.wait || 600 * 1000
    const namespace = 'substrate-chaosnet'
    const serviceName = 'substrate-service'
    const deployName = 'substrate-deployment'
    const k8s = require('../../k8s')
    const jsonRpc = require('../../utils/json-rpc')

    async function loadTest() {
      try {
        // init deployment processes
        console.log('Creating namespace...')
        await k8s.createNameSpace(namespace)
        console.log('Deploying cluster...')
        await k8s.createDeployment(imageTag, namespace, deployName)
        // console.log('Creating service...')
        // await k8s.createService(port, namespace, serviceName)
        console.log('Starting local server')
        const pods = await k8s.getNameSpacedPods(namespace)
        const podName = pods[0].metadata.name
        await k8s.startForwardServer(namespace, podName, port, jsonRpcTest)
        // deployment setup finished, start doing jsonRpc calls
        // jsonRpcTest()
      } catch (error) {
        await caughtErrorAndExit(error)
      }
    }
    async function jsonRpcTest() {
      const now = Date.now()
      async function getdeploymentStatus() {
        if (Date.now() < now + wait) {
          try {
            const condition = await k8s.getDeploymentStatus(deployName, namespace)
            if (condition.status === 'True') {
              console.log('Deployment finished and ready to call chain api')
              setTimeout(startJsonRpcCall, 5000) // 5sec is a reasonable time for substrate node to start producing blocks,will throw error if not
            } else {
              setTimeout(getdeploymentStatus, 2000) // polling k8s server to check for deployment status. condition: 'Available' = true is desired
            }
          } catch (error) {
            console.log(error)
            process.exit(error)
          }
        } else {
          console.log('Test time out')
          process.exit('Test time out')
        }
      }
      async function startJsonRpcCall() {
        if (Date.now() < now + wait) {
          try {
            const height = await jsonRpc.getChainBlockHeight(url, port) // recursively call to check chainHeight, every 2sec
            console.log('Current Block Height: ' + height)
            if (height > 10) {
              succeedAndExit()
            } else {
              setTimeout(startJsonRpcCall, 2000); 
            }
          } catch (error) {
            console.log('error requesting chain block height', error)
            process.exit(1)
          }
        } else {
          console.log('Test time out')
          process.exit('Test time out')
        }
      }
  
      getdeploymentStatus()
    }
    async function caughtErrorAndExit(error) {
      // clean up all resources regardless since there is already an error happened
      console.log('caught error during testing', error)
      // try {
      //   await k8s.deleteService(serviceName, namespace)
      // } catch (error2) {
      //   throw error2
      // }
      try {
        await k8s.deleteDeployment(deployName, namespace)
      } catch (error2) {
        throw error2
      }
      try {
        await k8s.deleteNameSpace(namespace)
      } catch (error2) {
        throw error2
      }
      process.exit(1)
    }
  
    async function succeedAndExit() {
      // JsonRpc test done, clean up and finish test
      try {
        // await k8s.deleteService(serviceName, namespace)
        await k8s.deleteDeployment(deployName, namespace)
        await k8s.deleteNameSpace(namespace)
        console.log('Finished')
        process.exit(0)
      } catch (error) {
        console.log(error)
        process.exit(1)
      }
    }
    loadTest()

    // this.log(`hello ${name} from ./src/commands/singlenodeheight.js`)
  }
}

SingleNodeHeightCommand.description = `Test
`

SingleNodeHeightCommand.flags = {
  image: flags.string({char: 'i', description: 'image to deploy'}),
  port: flags.integer({char: 'p', description: 'port to deploy'}),
  url: flags.string({char: 'u', description: 'connect url'}),
  wait: flags.string({char: 'w', description: 'wait time in miliseconds to halt'}),
  height: flags.string({char: 'h', description: 'desired height to test'}),
}

module.exports = SingleNodeHeightCommand
