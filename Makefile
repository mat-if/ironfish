compose:
	@echo "Spinning up docker-compose environment."
	docker-compose -f ./tools/docker-compose.yml up -d

compose-dev:
	@echo "Spinning up dev docker-compose environment."
	docker-compose -f ./tools/docker-compose.dev.yml up -d

compose-logs:
	docker logs -t -f $(name)

compose-exec:
	@echo "Starting a shell in $(name)"
	docker exec -it $$(docker ps --filter "name=${name}" -q) /bin/sh

compose-down:
	@echo "Bringing down docker compose environment"
	docker-compose -f ./tools/docker-compose.dev.yml down

node1-hot:
	@echo "Starting Node 1"
	cd ironfish-cli && yarn start:once start \
		-v --name node1 --port 9001 --bootstrap='' --forceMining \
		--rpc.tcp --rpc.tcp.host=127.0.0.1 --rpc.tcp.port=8001 \
		--datadir ~/.ironfish-1

node1:
	@echo "Starting Node 1 with no hot-reload"
	cd ironfish-cli && yarn start:once start \
		-v --name node1 --port 9001 --bootstrap='' --forceMining \
		--rpc.tcp --rpc.tcp.host=127.0.0.1 --rpc.tcp.port=8001 \
		--datadir ~/.ironfish-1

node2-hot:
	@echo "Starting Node 2"
	cd ironfish-cli && yarn start:once start \
		-v --name node2 --port 9002 --bootstrap=127.0.0.1:9001 \
		--rpc.tcp --rpc.tcp.host=127.0.0.1 --rpc.tcp.port=8002 \
		--datadir ~/.ironfish-2

node2:
	@echo "Starting Node 2 with no hot-reload"
	cd ironfish-cli && yarn start:once start \
		-v --name node2 --port 9002 --bootstrap=127.0.0.1:9001 \
		--rpc.tcp --rpc.tcp.host=127.0.0.1 --rpc.tcp.port=8002 \
		--datadir ~/.ironfish-2

miner1-hot:
	@echo "Starting node1 miner"
	cd ironfish-cli && yarn start miners:start \
		--rpc.tcp --rpc.tcp.host=127.0.0.1 --rpc.tcp.port=8001

miner1:
	@echo "Starting node1 miner"
	cd ironfish-cli && yarn start:once miners:start \
		--rpc.tcp --rpc.tcp.host=127.0.0.1 --rpc.tcp.port=8001

miner1-threads:
	@echo "Starting node1 miner"
	cd ironfish-cli && yarn start:once miners:start \
		--rpc.tcp --rpc.tcp.host=127.0.0.1 --rpc.tcp.port=8001 \
		--threads 3

miner2:
	@echo "Starting node2 miner"
	cd ironfish-cli && yarn start:once miners:start \
		--rpc.tcp --rpc.tcp.host=127.0.0.1 --rpc.tcp.port=8002