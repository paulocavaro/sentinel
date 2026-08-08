export type SourceKind = 'blog' | 'press' | 'paper' | 'video' | 'forum'
export type SourceFormat = 'rss' | 'atom' | 'hn'
export type Lane = 'ai' | 'world'

export type Source = {
  id: string
  name: string
  kind: SourceKind
  format: SourceFormat
  lane: Lane
  url: string
  /** Lower wins when two sources carry the same story. */
  priority: number
}

/** One item as collected, before curation. All strings already sanitized. */
export type RawItem = {
  id: string
  title: string
  summary: string
  url: string
  imageUrl: string | null
  source: { id: string; name: string; kind: SourceKind; priority: number }
  lane: Lane
  publishedAt: string // ISO 8601
}

/** One item as published. */
export type Item = {
  id: string
  rank: number
  title: string
  description: string
  url: string
  image: string | null
  source: { name: string; kind: SourceKind }
  publishedAt: string // ISO 8601
  topics: string[]
}

export type Edition = {
  date: string
  generatedAt: string
  summary: string
  targetCount: number
  items: Item[]
}
