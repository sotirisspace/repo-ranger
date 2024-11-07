import aiService from '@services/ai.service';
import emojiService from '@services/emoji.service';
import githubService from '@services/github.service';
import scoreService from '@services/score.service';
import usernameService from '@services/username.service';
import { UsernameDTO } from '@Itypes/username.interface';
import { asyncFn, resFn } from '@utils/utils';
import { NextFunction, Request, Response } from 'express';
import eventsService from '@services/events.service';
import { GithubEvent } from '@models/github-events.model';
import { Repo } from '@models/repos.model';
import reposService from '@services/repos.service';
import { Commit } from '@models/commits.model';
import commitsService from '@services/commits.service';

const getTrendingUsers = asyncFn(async (_req: Request, res: Response, _next: NextFunction) => {
  const trendingUsers = await usernameService.getTrendingUsers();
  resFn(res, {
    status: 200,
    message: 'Trending users fetched successfully',
    data: trendingUsers,
    error: '',
    success: true,
  });
});

const createUsername = asyncFn(async (req: Request, res: Response, _next: NextFunction) => {
  const { username } = req.body;
  const reposData = await githubService.getGithubUserRepositories(username);
  const commits = await githubService.getGithubUserCommits(username, reposData);
  const pullRequests = await githubService.getGithubUserPullRequests(username);
  const userData = await githubService.getGithubUserInformation(username);
  const favLanguage = await githubService.getGithubUserFavLanguage(reposData);
  const score = await scoreService.calculateScore({
    reposData,
    commits,
    pullRequests,
  });

  const usernameData: UsernameDTO = {
    username,
    location: userData.location || 'Earth',
    fav_language: favLanguage,
    contributions: 0,
    avatar: userData.avatar_url,
    bio: userData.bio || '',
    email: userData.email || '',
    name: userData.name,
    followers: userData.followers || 0,
    following: userData.following || 0,
    github_url: userData.html_url,
    twitter_username: '',
    ai_description_updated_at: new Date(),
    score: score,
    extra_score: 0,
  };
  const savedUsername = await usernameService.createUsername(usernameData);
  const ai_description = await aiService.generateAiDescription(savedUsername);
  const ai_nickname = await aiService.generateAiNickname(savedUsername, ai_description);

  savedUsername.ai_description = ai_description;
  savedUsername.ai_nickname = ai_nickname;
  await savedUsername.save();

  // save repos
  const reposToSave = reposData.map((repo) => {
    const newRepo = new Repo();
    newRepo.username_id = savedUsername.id;
    newRepo.name = repo.name;
    newRepo.description = repo.description || '';
    newRepo.github_url = repo.url;
    newRepo.stars = repo.stargazers_count || 0;
    newRepo.forks = repo.forks_count || 0;
    newRepo.issues = repo.open_issues_count || 0;
    newRepo.pull_requests = 0;
    newRepo.github_id = repo.id;
    newRepo.commits = 0;
    newRepo.comments = 0;
    newRepo.created_at = new Date();
    return newRepo;
  });
  await reposService.createMultipleRepos(reposToSave);

  // save commits
  const commitsToSave = commits.map((commit) => {
    const newCommit = new Commit();
    newCommit.username_id = savedUsername.id;
    newCommit.created_at = new Date();
    newCommit.github_sha = commit.sha;
    newCommit.github_url = commit.html_url;
    newCommit.message = commit.commit.message;
    return newCommit;
  });

  await commitsService.createMultipleCommits(commitsToSave);

  resFn(res, {
    status: 200,
    message: 'Username created successfully',
    data: savedUsername,
    error: '',
    success: true,
  });
});

const getUsernames = asyncFn(async (req: Request, res: Response, _next: NextFunction) => {
  const usernames = await usernameService.getAllUsernames();
  const topUsers = await usernameService.getTopUsers(10);
  const usernamesWithEmoji = await Promise.all(
    usernames.map(async (username) => ({
      ...username,
      emoji: await emojiService.getEmoji(username.score, topUsers),
    })),
  );
  resFn(res, {
    status: 200,
    message: 'Usernames fetched successfully',
    data: usernamesWithEmoji,
    error: '',
    success: true,
  });
});

const getUsernameById = asyncFn(async (req: Request, res: Response, _next: NextFunction) => {
  const { id } = req.params;
  const username = await usernameService.get(Number(id));
  if (!username) {
    return resFn(res, {
      status: 404,
      message: 'Username not found',
      data: null,
      error: 'Username not found',
      success: false,
    });
  }
  const repos = await reposService.getReposByUsernameId(username.id);
  const topUsers = await usernameService.getTopUsers(10);
  const usernameWithEmoji = {
    ...username,
    emoji: emojiService.getEmoji(username.score, topUsers),
    repos: repos,
  };
  resFn(res, {
    status: 200,
    message: 'Username fetched successfully',
    data: usernameWithEmoji,
    error: '',
    success: true,
  });
});

const searchUsernames = asyncFn(async (req: Request, res: Response, _next: NextFunction) => {
  const { query, withTrending } = req.query;
  const usernames = await usernameService.searchUsernames(query as string);
  const topUsers = await usernameService.getTopUsers(10);
  let usernamesWithEmoji = await Promise.all(
    usernames.map(async (username) => ({
      ...username,
      emoji: await emojiService.getEmoji(username.score, topUsers),
    })),
  );

  if (withTrending === 'true') {
    const trendingUsers = await usernameService.getTrendingUsers();
    const trendingUsersSet = new Set(trendingUsers.map((user) => user.id));
    const uniqueUsers = usernamesWithEmoji.filter((user) => !trendingUsersSet.has(user.id));
    // Prepend trending users to the usernamesWithEmoji array
    usernamesWithEmoji = [...trendingUsers, ...uniqueUsers];
  }

  resFn(res, {
    status: 200,
    message: 'Usernames fetched successfully',
    data: usernamesWithEmoji,
    error: '',
    success: true,
  });
});

const searchUsernamesSortedByScore = asyncFn(async (req: Request, res: Response, _next: NextFunction) => {
  const { query, withTrending } = req.query;
  const usernames = await usernameService.searchUsernamesSortedByScore(query as string);
  const topUsers = await usernameService.getTopUsers(10);
  let usernamesWithEmoji = await Promise.all(
    usernames.map(async (username) => ({
      ...username,
      emoji: await emojiService.getEmoji(username.score, topUsers),
    })),
  );

  if (withTrending === 'true') {
    const trendingUsers = await usernameService.getTrendingUsers();
    const trendingUsersSet = new Set(trendingUsers.map((user) => user.id));
    const uniqueUsers = usernamesWithEmoji.filter((user) => !trendingUsersSet.has(user.id));
    // Prepend trending users to the usernamesWithEmoji array
    usernamesWithEmoji = [...trendingUsers, ...uniqueUsers];
  }

  resFn(res, {
    status: 200,
    message: 'Usernames fetched successfully',
    data: usernamesWithEmoji,
    error: '',
    success: true,
  });
});

const refreshUsername = asyncFn(async (req: Request, res: Response, _next: NextFunction) => {
  const { id } = req.params;
  const username = await usernameService.get(Number(id));
  if (!username) {
    return resFn(res, {
      status: 404,
      message: 'Username not found',
      data: null,
      error: 'Username not found',
      success: false,
    });
  }
  const reposData = await githubService.getGithubUserRepositories(username.username);
  const commits = await githubService.getGithubUserCommits(username.username, reposData);
  const pullRequests = await githubService.getGithubUserPullRequests(username.username);
  const userData = await githubService.getGithubUserInformation(username.username);
  const favLanguage = await githubService.getGithubUserFavLanguage(reposData);
  const events = await githubService.getGithubUserEvents(username.username);
  const score = await scoreService.calculateScore({
    reposData,
    commits,
    pullRequests,
  });
  const ai_description = username.ai_description ? username.ai_description : await aiService.generateAiDescription(username);
  const ai_nickname = username.ai_nickname ? username.ai_nickname : await aiService.generateAiNickname(username);
  const updatedUsername = await usernameService.updateUsername({
    username: username.username,
    score,
    location: userData.location || 'Earth',
    fav_language: favLanguage,
    contributions: 0,
    avatar: userData.avatar_url,
    bio: userData.bio || '',
    name: userData.name,
    ai_description,
    ai_nickname,
    followers: userData.followers || 0,
    following: userData.following || 0,
    github_url: userData.html_url,
    twitter_username: '',
    ai_description_updated_at: new Date(),
    extra_score: 0,
    email: userData.email || '',
  });

  const reposToSave = reposData.map((repo) => {
    const newRepo = new Repo();
    newRepo.username_id = updatedUsername.id;
    newRepo.name = repo.name;
    newRepo.description = repo.description || '';
    newRepo.github_url = repo.url;
    newRepo.stars = repo.stargazers_count || 0;
    newRepo.forks = repo.forks_count || 0;
    newRepo.issues = repo.open_issues_count || 0;
    newRepo.pull_requests = 0;
    newRepo.github_id = repo.id;
    newRepo.commits = 0;
    newRepo.comments = 0;
    newRepo.created_at = new Date();
    return newRepo;
  });
  await reposService.createMultipleRepos(reposToSave);

  const eventsToSave = events.map((event) => {
    let message = '';
    if (event.type === 'PushEvent') {
      message = event.payload.commits[0]?.message || '';
    }
    const newEvent = new GithubEvent();
    newEvent.username_id = updatedUsername.id;
    newEvent.github_repo_id = event.repo.id;
    newEvent.event_type = event.type;
    newEvent.event_size = event?.payload?.size || 0;
    newEvent.github_id = event.id;
    newEvent.message = message;
    newEvent.event_date = new Date(event.created_at);
    newEvent.created_at = new Date();
    return newEvent;
  });
  await eventsService.createMultipleEvents(eventsToSave);

  resFn(res, {
    status: 200,
    message: 'Username updated successfully',
    data: updatedUsername,
    error: '',
    success: true,
  });
});

export default {
  createUsername,
  getUsernames,
  getUsernameById,
  searchUsernames,
  searchUsernamesSortedByScore,
  refreshUsername,
  getTrendingUsers,
};
