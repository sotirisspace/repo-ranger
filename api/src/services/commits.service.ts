import { Commit } from '@models/commits.model';
import { Username } from '@models/username.model';
import { In } from 'typeorm';

const getCommitsByUsername = async (username: string) => {
  const usernameId = await Username.findOne({ where: { username } });
  if (!usernameId) {
    throw new Error('Username not found');
  }

  const commits = await Commit.find({ where: { username_id: usernameId.id } });
  return commits;
};

const getCommitsByUsernameId = async (usernameId: number) => {
  const commits = await Commit.find({ where: { username_id: usernameId } });
  return commits;
};

const getAllCommits = async () => {
  const commits = await Commit.find();
  return commits;
};

const createCommit = async (commit: Commit) => {
  const newCommit = await Commit.create(commit);
  return newCommit;
};

const createMultipleCommits = async (commits: Commit[]) => {
  const githubIds = commits.map((commit) => commit.github_sha);
  const existingCommits = await Commit.find({ where: { github_sha: In(githubIds) } });
  const existingGithubIds = new Set(existingCommits.map((commit) => commit.github_sha));

  const newCommits = commits
    .filter((commit) => !existingGithubIds.has(commit.github_sha))
    .map((commit) => {
      const newCommit = new Commit();
      newCommit.username_id = commit.username_id;
      newCommit.github_url = commit.github_url;
      newCommit.github_sha = commit.github_sha;
      newCommit.message = commit.message;
      newCommit.username = commit.username;
      newCommit.created_at = commit.created_at;
      newCommit.created_at = new Date();
      return newCommit;
    });

  await Commit.save(newCommits);
  return newCommits;
};

const updateCommit = async (commit: Commit) => {
  const updatedCommit = await Commit.update(commit.id, commit);
  return updatedCommit;
};

const getGithubCommitByGithubId = async (githubId: string) => {
  const commit = await Commit.findOne({ where: { github_sha: githubId } });
  return commit;
};

export default {
  getCommitsByUsername,
  getAllCommits,
  createCommit,
  updateCommit,
  createMultipleCommits,
  getCommitsByUsernameId,
  getGithubCommitByGithubId,
};
