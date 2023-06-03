#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "@aws-cdk/core";
import { ValheimServerAwsCdkStack } from "../lib/valheim-server-aws-cdk-stack";
import { LambdaEcsFargateUpdownstatusStack } from '../lib/lambda-ecs-fargate-updownstatus-stack';
import { Arn } from "@aws-cdk/core";
import * as dotenv from 'dotenv';
import { ValheimStorageBackupStack } from "../lib/storage-backup-stack";

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

        const backupStack = new ValheimStorageBackupStack(app, "ValheimStorageBackupStack", {
            efsStorage: ecsStack.serverFileSystemerverFileSystem,
            env: {
                account: process.env.CDK_DEFAULT_ACCOUNT, 
                region: process.env.CDK_DEFAULT_REGION
            }
        })
        backupStack.addDependency(ecsStack);

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
