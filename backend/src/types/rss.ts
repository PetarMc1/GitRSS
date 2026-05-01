export type RssItem = {
  title: string;
  link: string;
  guid: string;
  pubDate: Date;
  description?: string;
};

export type RssFeedOptions = {
  title: string;
  description: string;
  link: string;
  items: RssItem[];
};
