#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "@aws-cdk/core";
import { ValheimServerAwsCdkStack } from "../lib/valheim-server-aws-cdk-stack";
import { LambdaEcsFargateUpdownstatusStack } from '../lib/lambda-ecs-fargate-updownstatus-stack';
import { ValheimServerMonitoringStack } from "../lib/monitoring-stack";
import { Arn } from "@aws-cdk/core";
import {HostedZone} from '@aws-cdk/aws-route53';
import * as dotenv from 'dotenv';

class ValheimServerProps {
    addAppGatewayStartStopStatus: boolean;
    serverName: string;
    worldName: string;
    tz: string;
    cpu: string;
    memory: string;
    startStopApiCustomDomain: string;
    startStopApiCustomDomainCertificateArn: Arn;
    startStopApiCustomDomainHostedZoneName: string;
    valheimServerDnsNameHostedZoneName: string;
    valheimServerDnsName: string;
}

class ValheimServer extends cdk.Construct {
    constructor(scope: cdk.Construct, id: string, props: ValheimServerProps) {
        super(scope, id);
        const ecsStack = new ValheimServerAwsCdkStack(app, "ValheimServerAwsCdkStack", {
            serverName: props.serverName,
            worldName: props.worldName,
            tz: props.tz,
            cpu: props.cpu,
            memory: props.memory,
            // valheimServerDnsNameHostedZoneId: props.valheimServerDnsNameHostedZoneId,
            valheimServerDnsNameHostedZoneName: props.valheimServerDnsNameHostedZoneName,
            valheimServerDnsName: props.valheimServerDnsName,
            env: {
                account: process.env.CDK_DEFAULT_ACCOUNT, 
                region: process.env.CDK_DEFAULT_REGION
            }
        });
        if( props?.addAppGatewayStartStopStatus )
        {
            const lambdaStack = new LambdaEcsFargateUpdownstatusStack(app, 'LambdaEcsFargateUpdownstatusStack', {
                serviceArn: ecsStack.valheimService.serviceArn,
                clusterArn: ecsStack.fargateCluster.clusterArn,
                customDomain: props.startStopApiCustomDomain,
                customDomainCertificateArn: props.startStopApiCustomDomainCertificateArn,
                // customDomainHostedZoneId: props.startStopApiCustomDomainHostedZoneId
                customDomainHostedZoneName: props.startStopApiCustomDomainHostedZoneName,
                env: {
                    account: process.env.CDK_DEFAULT_ACCOUNT, 
                    region: process.env.CDK_DEFAULT_REGION
                }
            });
            lambdaStack.addDependency(ecsStack);
        }

        const valheimServerMonitoringStack = new ValheimServerMonitoringStack(app, "ValheimServerMonitoring", {
            serviceArn: ecsStack.valheimService.serviceArn,
            clusterArn: ecsStack.fargateCluster.clusterArn,
            noPlayersMetric: ecsStack.noPlayersMetric,
            env: {
                account: process.env.CDK_DEFAULT_ACCOUNT, 
                region: process.env.CDK_DEFAULT_REGION
            }
        })
        valheimServerMonitoringStack.addDependency(ecsStack)
    }
}

const app = new cdk.App();
const dotEnvConfig = dotenv.config({path: '.env'});
if (dotEnvConfig.error) {
    console.error(dotEnvConfig.error);
    process.exit(1);
}
const valheimServerProps = dotEnvConfig.parsed as unknown as ValheimServerProps;
const valheimServer = new ValheimServer(app, process.env.appName || "ValheimServer",
    valheimServerProps
);
app.synth();
