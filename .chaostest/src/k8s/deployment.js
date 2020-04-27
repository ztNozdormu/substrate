const k8s = require('@kubernetes/client-node')

// load k8s
const kc = new k8s.KubeConfig()
kc.loadFromDefault()

// load k8s Apis
const k8sAppApi = kc.makeApiClient(k8s.AppsV1Api)
const k8sCoreApi = kc.makeApiClient(k8s.CoreV1Api)

const createNameSpace = async namespace => {
  const namespaceJson = {
    apiVersion: 'v1',
    kind: 'Namespace',
    metadata: {
      name: namespace,
    },
  }

  try {
    await k8sCoreApi.readNamespace(namespace)  // if namespace is available, do not create here
  } catch (error) {
    await k8sCoreApi.createNamespace(namespaceJson)
  }
}

const createService = async (port, namespace, serviceName) => {
  const service = {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
        name: serviceName
    },
    labels: {
        app: 'substrate-node'
    },
    spec: {
        type: 'NodePort',
        selector: {
            app: 'substrate-node'
        },
        ports: [{
           name: 'http',
           port: 9933,
           targetPort: 9933,
           nodePort: port,
           protocol: 'TCP'
        }]
    }
}

    // if service creation failed(ex: port allocated, existed), just delete and recreate a new one
    try {
        await k8sCoreApi.createNamespacedService(namespace, service)
    } catch (err) {
        console.log(err)
        await k8sCoreApi.deleteNamespacedService(serviceName, namespace)
        await k8sCoreApi.createNamespacedService(namespace, service)
    }
}

const createDeployment = async (image, namespace, deploymentName) => {
    const deployment = {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: {
            name: deploymentName,
        },
        labels: {
            app: 'substrate-node',
        },
        spec: {
            selector: {
                matchLabels: {
                    app: 'substrate-node',
                },
            },
            template: {
                metadata: {
                    labels: {
                        app: 'substrate-node',
                    },
                },
                spec: {
                    containers: [{
                        name: 'substrate-node',
                        image: image,
                        ports: [{containerPort: 9933}],
                        args: ['--dev', '--rpc-external', '--ws-external'],
                    }],
                },
            },
        },
    }

    // if deployment creation failed due to previous deployment not cleaned up, just delete and recreate a new one
    // throw error other wise
    try {
        await k8sAppApi.createNamespacedDeployment(namespace, deployment)
    } catch (error) {
        if (error.response.statusCode !== 409) {
          console.log(error)
          throw error
        }
        await k8sAppApi.deleteNamespacedDeployment(deploymentName, namespace)
        await k8sAppApi.createNamespacedDeployment(namespace, deployment)
    }
}

const getDeploymentStatus = async (deploymentName, namespace) => {
    const response = await k8sAppApi.readNamespacedDeploymentStatus(deploymentName, namespace)
    const status = response.response.body.status
    function getAvailability(item) {
        return item.type === 'Available';
    }
    return status.conditions.find(getAvailability)
}

const deleteService = async (serviceName, namespace) => {
    console.log('Taking down Service...')
    return k8sCoreApi.deleteNamespacedService(serviceName, namespace)
}

const deleteDeployment = async (deploymentName, namespace) => {
    console.log('Taking down Deployment...')
    return k8sAppApi.deleteNamespacedDeployment(deploymentName, namespace)
}

const deleteNameSpace = async (namespace) => {
    console.log('Taking down NameSpace...')
    return k8sCoreApi.deleteNamespace(namespace)
}

const getNameSpacedPods = async (namespace) => {
    const response = await k8sCoreApi.listNamespacedPod(namespace)
    return response.body.items
}

const startForwardServer =  async (namespace, pod, port, onReady) => {
    const net = require('net');
    const forward = new k8s.PortForward(kc);

    // This simple server just forwards traffic from itself to a service running in kubernetes
    // -> localhost:8080 -> port-forward-tunnel -> kubernetes-pod
    // This is basically equivalent to 'kubectl port-forward ...' but in TypeScript.
    const server = net.createServer((socket) => {
        forward.portForward(namespace, pod, [port], socket, null, socket);
    });

    server.listen(port, '127.0.0.1', ()=> {
        console.log('Forwarding server started, ready to connect')
        onReady()
    });
}



module.exports = {createDeployment, createNameSpace, createService, deleteDeployment, deleteService, deleteNameSpace, getDeploymentStatus, getNameSpacedPods, startForwardServer}