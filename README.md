## URL Shortener

This is a simple URL shortener built with Node.js and PostgreSQL. 

![](./Asset/systemDesign.drawio%20(1).svg)


AWS Architecture:

![](./Asset/systemDesign-aws.drawio.svg)

To run the project in AWS, create the necessary resources in AWS and run the following command from the config directory:

```bash
docker-compose up -d
```

Create the .env file in the root directory:

```
# .env
PORT=5000
PG_HOST=url_shortener_pgbouncer
PG_PORT=6432
PG_USER=your_pg_user
PG_PASSWORD=your_pg_password
PG_DATABASE=url_shortener
REDIS_HOST=url_shortener_redis
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password
BASE_URL=
OTEL_EXPORTER_OTLP_ENDPOINT_TRACE=http://localhost:4317
```


Run the docker image:

```
sudo docker run \
  --env-file .env \
  --network config_url-shortener-net \
  -p 5000:5000 \
  konami98/url-shortener-backend:v5
```

> Make sure to create necessary keys in the database.
