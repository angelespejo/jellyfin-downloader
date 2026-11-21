export interface JellyfinMediaStream {
  Index?: number
  Type?: string
  Codec?: string
  Language?: string
  Title?: string
  DisplayTitle?: string
  IsExternal?: boolean
  DeliveryUrl?: string
  IsTextSubtitleStream?: boolean
  IsDefault?: boolean
  IsForced?: boolean
  Width?: number
  Height?: number
  Channels?: number
  BitRate?: number
  PixelFormat?: string
}

export interface JellyfinMediaSource {
  Id?: string
  Name?: string
  Container?: string
  Size?: number
  Bitrate?: number
  RunTimeTicks?: number
  ETag?: string
  Path?: string
  Protocol?: string
  IsRemote?: boolean
  MediaStreams?: JellyfinMediaStream[]
}

export interface JellyfinItem {
  Id: string
  Name: string
  Type?: string
  ProductionYear?: number
  RunTimeTicks?: number
  Overview?: string
  ImageTags?: Record<string, string>
  MediaSources?: JellyfinMediaSource[]
  SeriesId?: string
  SeriesName?: string
  SeasonId?: string
  ParentIndexNumber?: number
  IndexNumber?: number
  ChildCount?: number
}

export interface JellyfinItemsResult {
  Items?: JellyfinItem[]
  TotalRecordCount?: number
}
