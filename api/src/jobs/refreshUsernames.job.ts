import { GithubRepo, GithubUser, GithubUserCommits } from '@Itypes/github.interface';
import { JobState } from '@models/job.model';
import { Repo } from '@models/repos.model';
import { Username } from '@models/username.model';
import aiService from '@services/ai.service';
import eventsService from '@services/events.service';
import githubService from '@services/github.service';
import reposService from '@services/repos.service';
import scoreService from '@services/score.service';
import usernameService from '@services/username.service';
import { logger } from '@utils/utils';
import { Job } from 'agenda';
import { GithubEvent } from '@Itypes/events.interface';
import commitsService from '@services/commits.service';
import { Commit } from '@models/commits.model';

const refreshUsernames = async (job: Job) => {
  const lastJobId = await getLastUserId();
  const lastUserId = await usernameService.getLastUserId();

  if (!lastUserId) {
    logger('error', 'No users found in the database');
    return;
  }

  const currentUser = await usernameService.get(lastJobId);

  if (!currentUser) {
    await handleNoUserFound(lastJobId, lastUserId);
    return;
  }

  if (shouldSkipUser(currentUser)) {
    await updateJobState();
    return;
  }

  logger('info', `Processing user: ${currentUser.username}`);

  try {
    await processUser(currentUser, job);
  } catch (err) {
    logger('error', `Error updating user ${currentUser.username}: ${err}`);
  }

  await updateJobState();
};

async function handleNoUserFound(lastJobId: number, lastUserId: number) {
  logger('info', `No user in the database with ID ${lastJobId}`);

  if (lastJobId > lastUserId) {
    logger('info', 'Resetting last processed user ID to 0');
    await resetJobState();
  } else {
    await updateJobState();
  }
}

function shouldSkipUser(user: Username) {
  const userDate = user.updated_at ? user.updated_at : user.created_at;
  const oneDayAgo = new Date(Date.now() - 1000 * 60 * 60 * 24);
  if (userDate && userDate > oneDayAgo) {
    logger('info', `User ${user.username} updated within the last day, skipping`);
    return true;
  }
  return false;
}

async function processUser(user: Username, job: Job) {
  const { reposData, commits, pullRequests, userData, favLanguage, events } = await fetchGithubData(user.username);
  await saveCommits(commits, user);
  const allCommits = await commitsService.getCommitsByUsernameId(user.id);
  const score = await scoreService.calculateScore({ reposData, commits: allCommits, pullRequests });
  const aiData = await generateAiData(user);
  const updatedUsername = await updateUsername(user, userData, score, favLanguage, aiData);
  await job.save();

  await processEvents(events, updatedUsername);
  await saveRepos(reposData, updatedUsername);

  logger('info', `User ${updatedUsername.username} updated`);
}

async function fetchGithubData(username: string) {
  logger('info', `Fetching ${username} Github data`);

  const [reposData, pullRequests, userData, events] = await Promise.all([
    githubService.getGithubUserRepositories(username),
    githubService.getGithubUserPullRequests(username),
    githubService.getGithubUserInformation(username),
    githubService.getGithubUserEvents(username),
  ]);

  // Fetch commits and favorite language after getting reposData
  const commits = await githubService.getGithubUserCommits(username, reposData);
  const favLanguage = await githubService.getGithubUserFavLanguage(reposData);

  const resp: {
    reposData: GithubRepo[];
    commits: GithubUserCommits[];
    pullRequests: any;
    userData: GithubUser;
    favLanguage: string;
    events: GithubEvent[];
  } = {
    reposData,
    commits,
    pullRequests,
    userData,
    favLanguage,
    events,
  };

  return resp;
}

async function generateAiData(user: Username) {
  const ai_description = user.ai_description || (await aiService.generateAiDescription(user));
  const ai_nickname = user.ai_nickname || (await aiService.generateAiNickname(user));
  return { ai_description, ai_nickname };
}

async function updateUsername(user: Username, userData: GithubUser, score: number, favLanguage: string, aiData: any) {
  return await usernameService.updateUsername({
    username: user.username,
    score,
    location: userData.location || 'Earth',
    fav_language: favLanguage,
    contributions: 0,
    avatar: userData.avatar_url,
    bio: userData.bio || '',
    name: userData.login,
    ai_description: aiData.ai_description,
    ai_nickname: aiData.ai_nickname,
    followers: userData.followers || 0,
    following: userData.following || 0,
    github_url: userData.html_url,
    twitter_username: '',
    ai_description_updated_at: new Date(),
    extra_score: 0,
    email: userData.email || '',
    created_at: new Date(userData.created_at),
    updated_at: new Date(),
  });
}

async function processEvents(events: GithubEvent[], updatedUsername: Username) {
  for (const event of events) {
    if (!event.payload.commits) continue;
    const eventExists = await eventsService.getEventByGithubId(event.id);
    if (eventExists) continue;

    const eventDTO = {
      username_id: updatedUsername.id,
      github_repo_id: event.repo.id,
      event_type: event.type,
      event_size: event.payload.size,
      github_id: event.id,
      message: event.payload.commits[0]?.message || '',
      event_date: new Date(event.created_at),
    };
    await eventsService.createEvent(eventDTO);
  }
}

async function saveRepos(reposData: GithubRepo[], updatedUsername: Username) {
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
}

async function saveCommits(commitsData: GithubUserCommits[], updatedUsername: Username) {
  const commitToSave = commitsData.map((commit) => {
    const newCommit = new Commit();
    newCommit.username_id = updatedUsername.id;
    newCommit.created_at = new Date();
    newCommit.github_sha = commit.sha;
    newCommit.github_url = commit.html_url;
    newCommit.message = commit.commit.message;
    return newCommit;
  });
  await commitsService.createMultipleCommits(commitToSave);
}

async function updateJobState() {
  const getJobState = await JobState.findOne({ where: { jobName: 'refreshUsernames' } });
  if (!getJobState) {
    const newJobState = new JobState();
    newJobState.jobName = 'refreshUsernames';
    newJobState.lastProcessedUserId = 1;

    await newJobState.save();

    return;
  }
  getJobState.lastProcessedUserId += 1;
  await getJobState.save();
}

async function getLastUserId() {
  const job = await JobState.findOne({ where: { jobName: 'refreshUsernames' } });
  if (!job) {
    return 1;
  }
  return job.lastProcessedUserId;
}

async function resetJobState() {
  const job = await JobState.findOne({ where: { jobName: 'refreshUsernames' } });
  if (!job) {
    return;
  }
  job.lastProcessedUserId = 0;
  await job.save();
}

export default refreshUsernames;
