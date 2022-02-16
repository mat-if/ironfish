import net from 'net'


let requests = {}
let nextId = 0

// { id, port, publicKey, socket }
let nodes = [
    {
        id: 0,
        port: 8001,
    },
    {
        id: 1,
        port: 8002,
    },
    // {
        // id: 2,
    //     port: 8003,
    // },
]

function start() {
    for (const node of nodes) {
        node.socket = net.connect(node.port, 'localhost')
        node.socket.on('connect', () => {
            // get the active address
            let payload = rpcPayload('account/getPublicKey', { generate: false })
            write(node.socket, payload)
        })
        node.socket.on('data', (data) => {
            console.log(node.id, 'received:', data.toString())
            let response = JSON.parse(data.toString().trim())
            switch (requests[response.data.id]) {
                case 'account/getPublicKey':
                    node.publicKey = response.data.data.publicKey
                    break
                default:
                    console.error('unrecognized response received')
            }
        })
    }

    let x = setInterval(sendLoop, 2000)
}

function sendLoop() {
    for (const node of nodes) {
        let recipientNodeId = node.id + 1
        if (recipientNodeId >= nodes.length) {
            recipientNodeId = 0
        }
        let recipientNode = nodes[recipientNodeId]
        console.log('Sending from', node.id, 'to', recipientNode.id)
        if (node.publicKey == null || recipientNode.publicKey == null) {
            console.error("MISSING A PUB KEY")
        }
        send(node, recipientNode)
    }
}

function send(nodeFrom, nodeTo) {
    let transactionRequest = rpcPayload('transaction/sendTransaction', { 
        fromAccountName: 'default',
        receives: [{
            publicAddress: nodeTo.publicKey,
            amount: '1',
            memo: 'hello',
        }],
        fee: '1',
     })
     write(nodeFrom.socket, transactionRequest)
}

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms)
    })
}

function rpcPayload(rpcRoute, endpointPayload) {
    let id = nextId++
    let payload = {
        type: 'message',
        data: {
            mid: id,
            type: rpcRoute,
            data: endpointPayload,
        }
    }
    requests[id] = rpcRoute
    return payload
}

function write(socket, payload) {
    socket.write(JSON.stringify(payload) + '\f')
}

start()