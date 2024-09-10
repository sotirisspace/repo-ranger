import { Username } from '@/model';
import { generateAiDescription, retrieveGithubInformation } from '@/service';
import { Request, Response } from 'express';
import { getEmoji } from '@/service';
import { Like } from 'typeorm';

export const createUsername = async (req: Request, res: Response) => {
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({
      message: 'Username is required',
    });
  }

  const { score, country, favoriteLanguage, contributions, status, name, bio, avatar, followers, following } =
    await retrieveGithubInformation(username);

  if (status == 404) {
    return res.status(404).json({
      message: 'User not found',
    });
  }

  const newUsername = new Username();

  newUsername.username = username;
  newUsername.score = score;
  newUsername.location = country;
  newUsername.fav_language = favoriteLanguage;
  newUsername.contributions = contributions;
  newUsername.name = name;
  newUsername.bio = bio;
  newUsername.avatar = avatar;
  newUsername.followers = followers;
  newUsername.following = following;

  await newUsername.save();

  const aiDescription = await generateAiDescription(newUsername);
  newUsername.ai_description = aiDescription;
  newUsername.ai_description_updated_at = new Date();
  await newUsername.save();

  res.json({
    message: 'Username created',
    username: newUsername,
  });
};

export const getUsernames = async (req: Request, res: Response) => {
  const usernames = await Username.find();
  const usernamesWithEmoji = await Promise.all(
    usernames.map(async (username) => ({
      ...username,
      emoji: await getEmoji(username.score),
    })),
  );
  res.json({
    usernames: usernamesWithEmoji,
  });
};

export const getUsernameById = async (req: Request, res: Response) => {
  if (!req.params.id) {
    return res.status(400).json({
      message: 'Id is required',
    });
  }

  const username = await Username.findOne({ where: { id: Number(req.params.id) } });

  if (!username) {
    return res.status(404).json({
      message: 'Username not found',
    });
  }

  const emoji = await getEmoji(username.score);

  res.json({
    username: {
      ...username,
      emoji,
    },
  });
};

export const searchUsernames = async (req: Request, res: Response) => {
  const { query } = req.query;

  const usernames = await Username.find({
    where: {
      username: Like(`%${query}%`),
    },
    order: {
      score: 'DESC',
    },
  });

  const usernamesWithEmoji = await Promise.all(
    usernames.map(async (username) => ({
      ...username,
      emoji: await getEmoji(username.score),
    })),
  );

  res.json({
    usernames: usernamesWithEmoji,
  });
};

export const refreshScore = async (req: Request, res: Response) => {
  const username = await Username.findOne({ where: { id: Number(req.params.id) } });

  if (!username) {
    return res.status(404).json({
      message: 'Username not found',
    });
  }

  const { score, country, favoriteLanguage, contributions, name, bio, avatar, followers, following } = await retrieveGithubInformation(
    username.username,
  );

  username.score = score;
  username.location = country;
  username.fav_language = favoriteLanguage;
  username.contributions = contributions;
  username.name = name;
  username.bio = bio;
  username.avatar = avatar;
  username.followers = followers;
  username.following = following;

  await username.save();

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  if (!username.ai_description_updated_at || username.ai_description_updated_at < oneWeekAgo) {
    username.ai_description = await generateAiDescription(username);
    username.ai_description_updated_at = new Date();
    await username.save();
  }

  res.json({
    username,
  });
};
