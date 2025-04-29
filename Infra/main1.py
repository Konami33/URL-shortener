import os
import pulumi
import pulumi_aws as aws

# Configuration
vpc_cidr = "10.0.0.0/16"
public_subnet_cidrs = ["10.0.1.0/24", "10.0.2.0/24"]  # ap-southeast-1a, ap-southeast-1b
private_subnet_cidrs = ["10.0.3.0/24", "10.0.4.0/24"]  # ap-southeast-1a, ap-southeast-1b

instance_type = 't2.micro'
ami = 'ami-01811d4912b4ccb26'  # Ubuntu 22.04 LTS in ap-southeast-1
key_name = "url-shortener"

# Create a VPC
vpc = aws.ec2.Vpc("url-shortener-vpc",
    cidr_block=vpc_cidr,
    enable_dns_hostnames=True,
    enable_dns_support=True,
    tags={
        "Name": "url-shortener-vpc",
    })

# Create Internet Gateway
igw = aws.ec2.InternetGateway("url-shortener-igw",
    vpc_id=vpc.id,
    tags={
        "Name": "url-shortener-igw",
    })

# Create Public Subnets
public_subnets = []
for i, cidr in enumerate(public_subnet_cidrs):
    az = "ap-southeast-1a" if i == 0 else "ap-southeast-1b"
    subnet = aws.ec2.Subnet(f"public-subnet-{i}",
        vpc_id=vpc.id,
        cidr_block=cidr,
        availability_zone=az,
        map_public_ip_on_launch=True,
        tags={
            "Name": f"public-subnet-{i}",
        })
    public_subnets.append(subnet)

# Create Private Subnets
private_subnets = []
for i, cidr in enumerate(private_subnet_cidrs):
    az = "ap-southeast-1a" if i == 0 else "ap-southeast-1b"
    subnet = aws.ec2.Subnet(f"private-subnet-{i}",
        vpc_id=vpc.id,
        cidr_block=cidr,
        availability_zone=az,
        tags={
            "Name": f"private-subnet-{i}",
        })
    private_subnets.append(subnet)

# Create NAT Gateway in public subnet (for private subnet internet access)
eip = aws.ec2.Eip("nat-eip",
    vpc=True,
    tags={
        "Name": "url-shortener-nat-eip",
    }
)

nat_gateway = aws.ec2.NatGateway("nat-gateway",
    allocation_id=eip.id,
    subnet_id=public_subnets[0].id,
    tags={
        "Name": "url-shortener-nat-gw",
    },
    opts=pulumi.ResourceOptions(depends_on=[igw])
)

# Create Route Tables
public_route_table = aws.ec2.RouteTable("public-route-table",
    vpc_id=vpc.id,
    routes=[
        aws.ec2.RouteTableRouteArgs(
            cidr_block="0.0.0.0/0",
            gateway_id=igw.id,
        ),
    ],
    tags={
        "Name": "public-route-table",
    })

private_route_table = aws.ec2.RouteTable("private-route-table",
    vpc_id=vpc.id,
    routes=[
        aws.ec2.RouteTableRouteArgs(
            cidr_block="0.0.0.0/0",
            nat_gateway_id=nat_gateway.id,
        ),
    ],
    tags={
        "Name": "private-route-table",
    })

# Associate Route Tables with Subnets
for i, subnet in enumerate(public_subnets):
    aws.ec2.RouteTableAssociation(f"public-rt-assoc-{i}",
        route_table_id=public_route_table.id,
        subnet_id=subnet.id)

for i, subnet in enumerate(private_subnets):
    aws.ec2.RouteTableAssociation(f"private-rt-assoc-{i}",
        route_table_id=private_route_table.id,
        subnet_id=subnet.id)
    

# Create Bastion Host
bastion_sg = aws.ec2.SecurityGroup("bastion-sg",
    description="Allow SSH from my IP",
    vpc_id=vpc.id,
    ingress=[
        aws.ec2.SecurityGroupIngressArgs(
            description="SSH from my IP",
            from_port=22,
            to_port=22,
            protocol="tcp",
            cidr_blocks=['0.0.0.0/0'],  # Set your IP in Pulumi config
        ),
    ],
    egress=[
        aws.ec2.SecurityGroupEgressArgs(
            from_port=0,
            to_port=0,
            protocol="-1",
            cidr_blocks=["0.0.0.0/0"],
        ),
    ],
    tags={
        "Name": "url-shortener-bastion-sg",
    })

# Create Security Groups
alb_sg = aws.ec2.SecurityGroup("alb-sg",
    description="Allow HTTP/HTTPS traffic to ALB",
    vpc_id=vpc.id,
    ingress=[
        aws.ec2.SecurityGroupIngressArgs(
            description="HTTP",
            from_port=80,
            to_port=80,
            protocol="tcp",
            cidr_blocks=["0.0.0.0/0"],
        ),
        aws.ec2.SecurityGroupIngressArgs(
            description="HTTPS",
            from_port=443,
            to_port=443,
            protocol="tcp",
            cidr_blocks=["0.0.0.0/0"],
        ),
    ],
    egress=[
        aws.ec2.SecurityGroupEgressArgs(
            from_port=0,
            to_port=0,
            protocol="-1",
            cidr_blocks=["0.0.0.0/0"],
        ),
    ],
    tags={
        "Name": "url-shortener-alb-sg",
    })


app_sg = aws.ec2.SecurityGroup("app-sg",
    description="Allow traffic from ALB and SSH from bastion",
    vpc_id=vpc.id,
    ingress=[
        aws.ec2.SecurityGroupIngressArgs(
            description="HTTP from ALB",
            from_port=3000,
            to_port=3000,
            protocol="tcp",
            security_groups=[alb_sg.id],
        ),
        aws.ec2.SecurityGroupIngressArgs(
            description="SSH from bastion",
            from_port=22,
            to_port=22,
            protocol="tcp",
            security_groups=[bastion_sg.id],
        ),
    ],
    egress=[
        aws.ec2.SecurityGroupEgressArgs(
            from_port=0,
            to_port=0,
            protocol="-1",
            cidr_blocks=["0.0.0.0/0"],
        ),
    ],
    tags={
        "Name": "url-shortener-app-sg",
    }
)

# Create Security Groups
pgbouncer_sg = aws.ec2.SecurityGroup("pgbouncer-sg",
    description="Allow PostgreSQL traffic from app servers",
    vpc_id=vpc.id,
    ingress=[
        aws.ec2.SecurityGroupIngressArgs(
            description="PgBouncer from app servers",
            from_port=6432,
            to_port=6432,
            protocol="tcp",
            security_groups=[app_sg.id],
        ),
        aws.ec2.SecurityGroupIngressArgs(
            description="SSH from bastion",
            from_port=22,
            to_port=22,
            protocol="tcp",
            security_groups=[bastion_sg.id],
        ),
    ],
    egress=[aws.ec2.SecurityGroupEgressArgs(
        from_port=0,
        to_port=0,
        protocol="-1",
        cidr_blocks=["0.0.0.0/0"],
    )],
    tags={"Name": "url-shortener-pgbouncer-sg"}
)

# Update db_sg to only allow PgBouncer to connect to Citus
db_sg = aws.ec2.SecurityGroup("db-sg",
    description="Allow traffic from PgBouncer and Redis clients",
    vpc_id=vpc.id,
    ingress=[
        aws.ec2.SecurityGroupIngressArgs(
            description="Redis from app servers",
            from_port=6379,
            to_port=6379,
            protocol="tcp",
            security_groups=[app_sg.id],
        ),
        aws.ec2.SecurityGroupIngressArgs(
            description="PostgreSQL from PgBouncer",
            from_port=5432,
            to_port=5432,
            protocol="tcp",
            security_groups=[pgbouncer_sg.id],  # Only PgBouncer can connect
        ),
        aws.ec2.SecurityGroupIngressArgs(
            description="SSH from bastion",
            from_port=22,
            to_port=22,
            protocol="tcp",
            security_groups=[bastion_sg.id],
        ),
        # Allow coordinator to talk to workers
        aws.ec2.SecurityGroupIngressArgs(
            description="Citus worker communication",
            from_port=5432,
            to_port=5432,
            protocol="tcp",
            self=True,  # Allow instances with this SG to talk to each other
        ),
    ],
    egress=[aws.ec2.SecurityGroupEgressArgs(
        from_port=0,
        to_port=0,
        protocol="-1",
        cidr_blocks=["0.0.0.0/0"],
    )],
    tags={"Name": "url-shortener-db-sg"}
)

bastion = aws.ec2.Instance("bastion-host",
    ami="ami-0fa377108253bf620",  # Amazon Linux 2 in ap-southeast-1
    instance_type=instance_type,
    subnet_id=public_subnets[0].id,
    vpc_security_group_ids=[bastion_sg.id],
    associate_public_ip_address=True,
    key_name=key_name,
    tags={
        "Name": "url-shortener-bastion",
})

# Create ALB
alb = aws.lb.LoadBalancer("url-shortener-alb",
    internal=False,
    load_balancer_type="application",
    security_groups=[alb_sg.id],
    subnets=[subnet.id for subnet in public_subnets],
    tags={
        "Name": "url-shortener-alb",
    })

target_group = aws.lb.TargetGroup("app-target-group",
    port=3000,
    protocol="HTTP",
    vpc_id=vpc.id,
    target_type="instance",
    health_check=aws.lb.TargetGroupHealthCheckArgs(
        path="/health",
        port="3000",
        protocol="HTTP",
        healthy_threshold=2,
        unhealthy_threshold=2,
        timeout=3,
        interval=30,
    ),
    tags={
        "Name": "url-shortener-app-tg",
    })

listener = aws.lb.Listener("alb-listener",
    load_balancer_arn=alb.arn,
    port=80,
    protocol="HTTP",
    default_actions=[aws.lb.ListenerDefaultActionArgs(
        type="forward",
        target_group_arn=target_group.arn,
    )])

user_data = """#!/bin/bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y docker.io docker-compose
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker ubuntu
"""

# Create Node.js App Instances
app_instances = []
for i in range(2):
    instance = aws.ec2.Instance(f"app-instance-{i}",
        ami=ami,
        instance_type=instance_type,
        subnet_id=private_subnets[i].id,
        vpc_security_group_ids=[app_sg.id],
        key_name=key_name,
        user_data=user_data,
        tags={
            "Name": f"url-shortener-app-{i}",
        },
        opts=pulumi.ResourceOptions(
            depends_on=[
                nat_gateway,
            ]
        )
    )
    app_instances.append(instance)

# Register app instances with target group
for i, instance in enumerate(app_instances):
    aws.lb.TargetGroupAttachment(f"tg-attachment-{i}",
        target_group_arn=target_group.arn,
        target_id=instance.id)

# Create Redis Instance
redis_instance = aws.ec2.Instance("redis-instance",
    ami=ami,
    instance_type=instance_type,
    subnet_id=private_subnets[0].id, #ap-southeast-1a
    vpc_security_group_ids=[db_sg.id],
    key_name=key_name,
    user_data="""#!/bin/bash
    # Update system and install Docker
    sudo apt-get update -y
    sudo apt-get install -y docker.io
    sudo systemctl enable docker
    sudo systemctl start docker

    # Run Redis container
    sudo docker run -d \
        --name url_shortener_redis \
        -v redis-data:/data \
        -p 6379:6379 \
        --restart unless-stopped \
        redis:7.0 \
        redis-server --requirepass your_redis_password
    """,
    tags={
        "Name": "url-shortener-redis",
    },
    opts=pulumi.ResourceOptions(
        depends_on=[
            nat_gateway,
        ]
    )
)

# PgBouncer EC2 Instance
pgbouncer_instance = aws.ec2.Instance("pgbouncer",
    ami=ami,  
    instance_type=instance_type,
    subnet_id=private_subnets[0].id, #ap-southeast-1a
    vpc_security_group_ids=[pgbouncer_sg.id],
    key_name=key_name,
    user_data="""#!/bin/bash
        apt update && apt install -y pgbouncer
        systemctl enable pgbouncer
        systemctl start pgbouncer
    """,
    tags={"Name": "url-shortener-pgbouncer"},
    opts=pulumi.ResourceOptions(
        depends_on=[
            nat_gateway,
        ]
    )
)

# Create Citus Coordinator
coordinator_instance = aws.ec2.Instance("citus-coordinator",
    ami=ami,
    instance_type=instance_type,
    subnet_id=private_subnets[0].id, #ap-southeast-1a
    vpc_security_group_ids=[db_sg.id],
    key_name=key_name,
    user_data=user_data,
    tags={
        "Name": "url-shortener-citus-coordinator",
    },
    opts=pulumi.ResourceOptions(
        depends_on=[
            nat_gateway,
        ]
    )
)

# Create Citus Workers
worker_instances = []
for i in range(2):
    instance = aws.ec2.Instance(f"citus-worker-{i}",
        ami=ami,
        instance_type=instance_type,
        subnet_id=private_subnets[i].id,
        vpc_security_group_ids=[db_sg.id],
        key_name=key_name,
        user_data=user_data,
        tags={
            "Name": f"url-shortener-citus-worker-{i}",
        },
        opts=pulumi.ResourceOptions(
            depends_on=[
                nat_gateway,
            ]
        )
    )
    worker_instances.append(instance)

# Output important information
pulumi.export("vpc_id", vpc.id)
pulumi.export("alb_dns_name", alb.dns_name)
pulumi.export("bastion_public_ip", bastion.public_ip)
pulumi.export("app_instance_ids", [instance.id for instance in app_instances])
pulumi.export("redis_instance_id", redis_instance.id)
pulumi.export("citus_coordinator_id", coordinator_instance.id)
pulumi.export("citus_worker_ids", [instance.id for instance in worker_instances])

pulumi.export("app_private_ips", [instance.private_ip for instance in app_instances])
pulumi.export("redis_private_ip", redis_instance.private_ip)
pulumi.export("pgbouncer_private_ip", pgbouncer_instance.private_ip)
pulumi.export("citus_coordinator_private_ip", coordinator_instance.private_ip)
pulumi.export("citus_worker_private_ips", [instance.private_ip for instance in worker_instances])

# Create config file for SSH access
def create_config_file(ips):
    bastion_host = 'bastion-server'

    # Map hostnames to the correct IPs
    private_host_map = {
        'app-server-1': ips['app_private_ips'][0],
        'app-server-2': ips['app_private_ips'][1],
        'citus-coordinator-server': ips['citus_coordinator_private_ip'],
        'citus-worker-server-1': ips['citus_worker_private_ips'][0],
        'citus-worker-server-2': ips['citus_worker_private_ips'][1],
        'pgbouncer-server': ips['pgbouncer_private_ip'],
        'redis-server': ips['redis_private_ip'],
    }

    # Start building SSH config
    config_content = f"""Host {bastion_host}
    HostName {ips['bastion_public_ip']}
    User ubuntu
    IdentityFile ~/.ssh/{key_name}.id_rsa

"""

    for hostname, ip in private_host_map.items():
        config_content += f"""Host {hostname}
    ProxyJump {bastion_host}
    HostName {ip}
    User ubuntu
    IdentityFile ~/.ssh/{key_name}.id_rsa

"""

    config_path = os.path.expanduser("~/.ssh/config")

    # Ensure the .ssh directory exists
    os.makedirs(os.path.dirname(config_path), exist_ok=True)

    # Write the SSH config file
    with open(config_path, "w") as config_file:
        config_file.write(config_content)

    # Optional: Secure the file (Linux/Mac)
    os.chmod(config_path, 0o600)


# Collect the IPs for all nodes
all_ips = pulumi.Output.all(
    bastion_public_ip=bastion.public_ip,
    app_private_ips=pulumi.Output.all(*[instance.private_ip for instance in app_instances]),
    redis_private_ip=redis_instance.private_ip,
    citus_coordinator_private_ip=coordinator_instance.private_ip,
    citus_worker_private_ips=pulumi.Output.all(*[instance.private_ip for instance in worker_instances]),
    pgbouncer_private_ip=pgbouncer_instance.private_ip
)

# Apply the config creation when outputs are resolved
all_ips.apply(lambda ips: create_config_file(ips))



# aws ec2 create-key-pair --key-name url-shortener --output text --query 'KeyMaterial' > url-shortener.id_rsa
# chmod 400 url-shortener.id_rsa
