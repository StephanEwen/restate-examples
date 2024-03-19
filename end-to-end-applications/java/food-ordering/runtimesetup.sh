#!/bin/bash

curl -i -s -X POST 'localhost:9070/deployments' -H 'content-type: application/json' -d '{"uri": "http://driver_mobile_app:9081"}' &&
curl -i -s -X POST 'localhost:9070/deployments' -H 'content-type: application/json' -d '{"uri": "http://host.docker.internal:9080"}' && 
sleep 3 && 
curl -i -s -X POST 'localhost:9070/subscriptions' -H 'content-type: application/json' -d '{ "source":"kafka://my-cluster/orders", "sink":"service://order.OrderWorkflow/HandleOrderCreationEvent" }' &&
curl -i -s -X POST 'localhost:9070/subscriptions' -H 'content-type: application/json' -d '{ "source":"kafka://my-cluster/driver-updates", "sink":"service://order.DriverDigitalTwin/HandleDriverLocationUpdateEvent" }' &&
sleep 3 && 
curl -i -s -X POST -H 'content-type: application/json' 'localhost:8080/order.DriverMobileAppSimulator/StartDriver' -d '{"driver_id": "driver-A"}' && 
curl -i -s -X POST -H 'content-type: application/json' 'localhost:8080/order.DriverMobileAppSimulator/StartDriver' -d '{"driver_id": "driver-B"}'