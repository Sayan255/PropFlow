#!/bin/sh
# PropFlow first-boot MySQL provisioning (runs via bitnami's /docker-entrypoint-initdb.d).
# Order-independent: works whether or not bitnami has already created the app user.
set -eu

mysql --protocol=socket -uroot -p"$MYSQL_ROOT_PASSWORD" <<SQL
CREATE DATABASE IF NOT EXISTS auth_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS crm_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${MYSQL_USER}'@'%' IDENTIFIED BY '${MYSQL_PASSWORD}';
GRANT ALL PRIVILEGES ON auth_db.* TO '${MYSQL_USER}'@'%';
GRANT ALL PRIVILEGES ON crm_db.* TO '${MYSQL_USER}'@'%';
FLUSH PRIVILEGES;
SQL
