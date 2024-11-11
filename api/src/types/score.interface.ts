import { GithubPullRequest, GithubRepo, GithubUserCommits } from '@Itypes/github.interface';
import { Commit } from '@models/commits.model';

export interface IScoreDataProps {
  reposData: GithubRepo[];
  commits: GithubUserCommits[] | Commit[];
  pullRequests: GithubPullRequest[];
}
