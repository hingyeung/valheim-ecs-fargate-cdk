"use strict";

const { ECSClient, ListTasksCommand, DescribeTasksCommand } = require('@aws-sdk/client-ecs');
const { EC2Client, DescribeNetworkInterfacesCommand } = require('@aws-sdk/client-ec2');
const { Route53Client, ChangeResourceRecordSetsCommand } = require("@aws-sdk/client-route-53");

exports.handler = async (event, context, callback) => {
  console.dir(event)

  if (! process.env.DNS_NAME) {
    throw Error("DOMAIN_NAME not set");
  }

  const ecsClient = new ECSClient();
  const ec2Client = new EC2Client();
  const r53Client = new Route53Client();

  const listTasksParams = {
    servicesName: process.env.SERVICE_ARN,
    cluster: process.env.CLUSTER_ARN,
    desiredStatus: "RUNNING"
  };
  const listTasksCommand = new ListTasksCommand(listTasksParams);
  const listTasks = await ecsClient.send(listTasksCommand);
  
  if (listTasks.taskArns.length > 0) {
    var describeTaskParams = {
      cluster: listTasksParams.cluster,
      tasks: listTasks.taskArns
    };

    const describeTaskCommand = new DescribeTasksCommand(describeTaskParams);
    const describeTasks = await ecsClient.send(describeTaskCommand);
    console.log(describeTasks);
    let networkInterfaceId = describeTasks.tasks[0].attachments[0].details.find(x => x.name === "networkInterfaceId").value;

    console.log("found network interfaceid " + networkInterfaceId);

    const describeNetworkInterfacesParams = {
      NetworkInterfaceIds: [networkInterfaceId]
    };

    const describeNetworkInterfacesCommand = new DescribeNetworkInterfacesCommand(describeNetworkInterfacesParams);

    const networkInterfaces = await ec2Client.send(describeNetworkInterfacesCommand);
    console.log(networkInterfaces);
    const publicIp = networkInterfaces.NetworkInterfaces.find(x => x.Association != undefined).Association.PublicIp;
    console.log("found public IP " + publicIp);

    const changeResourceRecordSetsParam = {
      HostedZoneId: process.env.HOSTED_ZONE_ID,
      ChangeBatch: {
        Changes: [{
          Action: "UPSERT",
          ResourceRecordSet: {
            Type: "A",
            TTL: 15,
            Name: process.env.DNS_NAME.replace(/\.*$/, '.'),
            ResourceRecords: [{
              Value: publicIp
            }]
          }
        }]
      }
    }
    const r53Resp = await r53Client.send(new ChangeResourceRecordSetsCommand(changeResourceRecordSetsParam))
    console.log(r53Resp)
  }
}