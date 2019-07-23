# Enviroment Variables

| Environment Variable      | Config Name(name on the `config` file) | Description                                                                       |
| ------------------------- | -------------------------------------- | --------------------------------------------------------------------------------- |
| NODE_ENV                  | .env                                   | Node Environment variable                                                         |
| PG_DATABASE               | .database.database                     | Postgres database name                                                            |
| PG_USERNAME               | .database.username                     | Postgres database username                                                        |
| PG_PASSWORD               | .database.password                     | Postgres database password                                                        |
| PG_HOST                   | .database.options.host                 | Postgres database host                                                            |
| PG_MIN_CONNECTIONS        | .database.options.pool.min             | Postgres number of min connections                                                |
| PG_MAX_CONNECTIONS        | .database.options.pool.max             | Postgres number of max connections                                                |
| API_KEY                   | .keys.opencollective.apiKey            | The API KEY                                                                       |
| JWT_SECRET                | .keys.opencollective.jwtSecret         | JWT secret                                                                        |
| STRIPE_CLIENT_ID          | .stripe.client_id                      | Stripe Client id                                                                  |
| STRIPE_KEY                | .stripe.key                            | Stripe key                                                                        |
| STRIPE_SECRET             | .stripe.secret                         | Stripe secret                                                                     |
| AWS_KEY                   | .aws.s3.key                            | AWS key                                                                           |
| AWS_SECRET                | .aws.s3.secret                         | AWS secret                                                                        |
| AWS_S3_BUCKET             | .aws.s3.bucket                         | AWS s3 bucket to send files                                                       |
| CLOUDFLARE_KEY            | .cloudflare.key                        | CLOUDFLARE key                                                                    |
| CLOUDFLARE_EMAIL          | .cloudflare.email                      | CLOUDFLARE email                                                                  |
| CLOUDFLARE_ZONE           | .cloudflare.zone                       | CLOUDFLARE zone                                                                   |
| PAYPAL_EMAIL              | .paypal.classic.email                  | Paypal main email                                                                 |
| PAYPAL_APP_ID             | .paypal.classic.appId                  | Paypal APP ID                                                                     |
| PAYPAL_PASSWORD           | .paypal.classic.password               | Paypal password                                                                   |
| PAYPAL_SIGNATURE          | .paypal.classic.signature              | Paypal signature                                                                  |
| MAILGUN_USER              | .mailgun.user                          | mailgun user                                                                      |
| MAILGUN_API_KEY           | .mailgun.apiKey                        | mailgun password                                                                  |
| API_URL                   | .host.api                              | API exposed url                                                                   |
| WEBAPP_URL                | .host.webapp                           | webapp URL                                                                        |
| WEBSITE_URL               | .host.website                          | UI URL                                                                            |
| FRONTEND_URL              | .host.frontend                         | URL of the frontend service (for caching)                                         |
| SLACK_HOOK_URL            | .slack.webhookUrl                      | slack hook url                                                                    |
| CLEARBIT_KEY              | .clearbit.key                          | clearbit key                                                                      |
| GITHUB_CLIENT_ID          | .github.clientId                       | github client ID                                                                  |
| GITHUB_CLIENT_SECRET      | .github.clientSecret                   | github client secret                                                              |
| MEETUP_CLIENT_ID          | .meetup.clientId                       | meetup client ID                                                                  |
| MEETUP_CLIENT_SECRET      | .meetup.clientSecret                   | meetup client secret                                                              |
| TWITTER_CONSUMER_KEY      | .twitter.consumerKey                   | twitter key                                                                       |
| TWITTER_CONSUMER_SECRET   | .twitter.consumerSecret                | twitter secret                                                                    |
| ALGOLIA_APP_ID            | .algolia.appId                         | algolia APP id                                                                    |
| ALGOLIA_KEY               | .algolia.appKey                        | algolia key                                                                       |
| ALGOLIA_INDEX             | .algolia.index                         | algolia index                                                                     |
| FOREST_AUTH_SECRET        |                                        | forest auth secret                                                                |
| FOREST_ENV_SECRET         |                                        | forest environment secret                                                         |
|                           | .stripe.redirectUri                    |                                                                                   |
| HELLO_WORKS_KEY           | .helloworks.key                        | hello works key                                                                   |
| HELLO_WORKS_SECRET        | .helloworks.secret                     | hello works secret                                                                |
| HELLO_WORKS_WORKFLOW_ID   | .helloworks.workflowId                 | hello works workflow id                                                           |
| HELLO_WORKS_CALLBACK_PATH | .helloworks.callbackPath               | hello works callback path to be appended to the api url, eg. /helloworks/callback |
