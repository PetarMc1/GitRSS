# GitRSS

A tool used to generate RSS feeds for GitHub repositories, providing updates on commits, issues, pull requests, releases, and combined.


## Features
- generates rss for commits, issues, pull requests, releases and combined
- uses ETags to use less github api requests
- redis caching
- optionally can use `GITHUB_TOKEN` (using `Authorization: Bearer <token>`) if provided
- starts up only if redis is working
- doesnt start up if github token is invalid (when provided)
- automatically handles github api rate limits, still serves cached pages

## Deployment
The app can be deployed using Docker. A `docker-compose.yml` file is provided for easy setup with Redis. The images are available at `docker.petarmc.com`.

To run with Docker Compose:

```bash
git clone https://github.com/PetarMc1/GitRSS.git
cd GitRSS
docker compose up -d
```

This will start the services. The frontend will be available at `http://localhost:3000` and the backend API at `http://localhost:3000/api`.

### Environment Variables
#### Backend
- `GITHUB_TOKEN`: optional GitHub token
- `REDIS_URL`: redis database url
- `DEEP_REFRESH_DAYS`: interval for "deep" refreshes of older pages (refetches all X pages of a feed not only the last one)

## Caching Behavior
- commit data is cached by pages in the redis db
- each page has:
  - data key
  - ETag key
- page 1 is always checked using ETag
- older pages are checked only when deep refresh time is reached
- if there are rate limits on Github API the backend will still be able to serve old cached pages


## API Endpoints
API Docs available at [gitrss.petarmc.com/api-docs](https://gitrss.petarmc.com/api-docs)