import { DataSource } from 'typeorm';
import * as mysql from 'mysql2/promise';
import { asyncFn } from '@utils/utils';
import { Username } from '@models/username.model';
import { ChatMessage } from '@models/message.model';
import { TwitterPost } from '@models/twitter-posts.model';
import { Repo } from '@models/repos.model';
import { JobState } from '@models/job.model';
import { GithubEvent } from '@models/github-events.model';
import { Commit } from '@models/commits.model';

export const AppDataSource = new DataSource({
  type: 'mysql',
  host: process.env.MYSQLHOST || 'localhost',
  port: parseInt(process.env.MYSQLPORT || '3306'),
  username: process.env.MYSQLUSER || 'root',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.MYSQL_DATABASE || 'repo-ranger',
  entities: [Username, ChatMessage, TwitterPost, Repo, JobState, GithubEvent, Commit],
  synchronize: true,
  logging: false,
});

export async function initializeDatabase() {
  const dbName = process.env.MYSQL_DATABASE || 'repo-ranger';

  asyncFn(async () => {
    const connection = await mysql.createConnection({
      host: process.env.MYSQLHOST || 'localhost',
      port: parseInt(process.env.MYSQLPORT || '3306'),
      user: process.env.MYSQLUSER || 'root',
      password: process.env.DB_PASSWORD || 'password',
    });

    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
    await connection.end();
  });
  await AppDataSource.initialize();
}

export default AppDataSource;
