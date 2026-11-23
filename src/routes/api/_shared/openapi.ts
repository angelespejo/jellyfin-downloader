export const openapiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'Jellyfin Downloader API',
    version: '1.0.0',
    description:
      'Server API to search Jellyfin movies, series and home videos and download them processed with ffmpeg. No authentication; protect it at the network level.',
  },
  servers: [{ url: '/api/v1' }],
  tags: [
    { name: 'Catalog', description: 'Movies, series, episodes, home videos and metadata' },
    { name: 'Downloads', description: 'Download and processing jobs' },
    { name: 'Local store', description: 'Reusable results on the server' },
    { name: 'Settings', description: 'Global defaults and presets' },
    { name: 'System', description: 'Health and capabilities' },
  ],
  paths: {
    '/health': {
      get: {
        tags: ['System'],
        summary: 'Application health',
        responses: { '200': { description: 'State' } },
      },
    },
    '/capabilities': {
      get: {
        tags: ['System'],
        summary: 'Available containers, codecs and limits',
        responses: { '200': { description: 'Capacidades' } },
      },
    },
    '/movies': {
      get: {
        tags: ['Catalog'],
        summary: 'List or search catalog items (movies, series and home videos)',
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 100, maximum: 500 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
        ],
        responses: { '200': { description: 'Catalog page' } },
      },
    },
    '/movies/{id}': {
      get: {
        tags: ['Catalog'],
        summary: 'Playable item details with tracks (movie, home video or episode)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Item' }, '404': { description: 'Not found' } },
      },
    },
    '/series/{id}': {
      get: {
        tags: ['Catalog'],
        summary: 'Series details with its episodes',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Series with episodes' },
          '400': { description: 'The item is not a series' },
          '404': { description: 'Not found' },
        },
      },
    },
    '/artwork/{id}': {
      get: {
        tags: ['Catalog'],
        summary: 'Poster proxied from Jellyfin',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          {
            name: 'w',
            in: 'query',
            schema: { type: 'integer', enum: [160, 300, 600], default: 300 },
          },
        ],
        responses: { '200': { description: 'Imagen' } },
      },
    },
    '/downloads': {
      get: {
        tags: ['Downloads'],
        summary: 'List active download jobs',
        parameters: [
          {
            name: 'state',
            in: 'query',
            schema: { type: 'string', enum: ['active', 'all'], default: 'active' },
          },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 100 } },
        ],
        responses: { '200': { description: 'Jobs with title, filename and progress' } },
      },
      post: {
        tags: ['Downloads'],
        summary: 'Create a download',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateDownloadRequest' },
            },
          },
        },
        responses: {
          '200': { description: 'Download already available in the local store' },
          '202': { description: 'Job created or already running' },
          '400': { description: 'Invalid options' },
          '429': { description: 'Queue full' },
        },
      },
    },
    '/downloads/batch': {
      post: {
        tags: ['Downloads'],
        summary: 'Create several downloads with one configuration',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/BatchDownloadRequest' } },
          },
        },
        responses: {
          '202': { description: 'Batch jobs and per-item errors' },
          '400': { description: 'Invalid batch' },
        },
      },
    },
    '/downloads/{id}': {
      get: {
        tags: ['Downloads'],
        summary: 'Job state and progress',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { '200': { description: 'State' }, '404': { description: 'Not found' } },
      },
      delete: {
        tags: ['Downloads'],
        summary: 'Cancel an active job',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': { description: 'Updated state' },
          '409': { description: 'Already finished' },
        },
      },
    },
    '/downloads/{id}/file': {
      get: {
        tags: ['Downloads'],
        summary: 'Download the final file; supports Range',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': { description: 'File' },
          '206': { description: 'Partial file' },
          '409': { description: 'Not ready yet' },
        },
      },
    },
    '/local-downloads': {
      get: {
        tags: ['Local store'],
        summary: 'List stored local downloads, optionally filtered by item or series',
        parameters: [
          {
            name: 'movieId',
            in: 'query',
            schema: { type: 'string', pattern: '^[0-9a-fA-F]{32}$' },
          },
          {
            name: 'seriesId',
            in: 'query',
            schema: { type: 'string', pattern: '^[0-9a-fA-F]{32}$' },
          },
        ],
        responses: { '200': { description: 'Stored downloads' } },
      },
    },
    '/local-downloads/{key}': {
      get: {
        tags: ['Local store'],
        summary: 'Get stored download metadata and configuration',
        parameters: [{ name: 'key', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Stored download metadata' },
          '404': { description: 'Not found' },
        },
      },
      delete: {
        tags: ['Local store'],
        summary: 'Delete a stored local download',
        parameters: [{ name: 'key', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Deleted' },
          '404': { description: 'Not found' },
        },
      },
    },
    '/local-downloads/{key}/file': {
      get: {
        tags: ['Local store'],
        summary: 'Download a stored local result',
        parameters: [{ name: 'key', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'File' },
          '206': { description: 'Partial file' },
          '404': { description: 'Not found' },
        },
      },
    },
    '/local-downloads/check': {
      post: {
        tags: ['Local store'],
        summary: 'Check whether a configuration already exists',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/CheckRequest' } },
          },
        },
        responses: { '200': { description: 'Check result' } },
      },
    },
    '/logs': {
      get: {
        tags: ['System'],
        summary: 'Read persisted logs or download a JSONL file',
        parameters: [
          {
            name: 'level',
            in: 'query',
            schema: { type: 'string', enum: ['info', 'warn', 'error'] },
          },
          { name: 'date', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 200, maximum: 1000 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0, minimum: 0 } },
          { name: 'download', in: 'query', schema: { type: 'string', enum: ['1'] } },
        ],
        responses: { '200': { description: 'Logs or JSONL file' } },
      },
      delete: {
        tags: ['System'],
        summary: 'Clear all logs or one day',
        parameters: [{ name: 'date', in: 'query', schema: { type: 'string', format: 'date' } }],
        responses: { '200': { description: 'Number of files removed' } },
      },
    },
    '/presets': {
      get: {
        tags: ['Settings'],
        summary: 'List presets, optionally filtered by tags',
        parameters: [
          {
            name: 'tag',
            in: 'query',
            description: 'Repeatable or comma-separated; presets must contain every tag',
            schema: { type: 'string' },
          },
        ],
        responses: { '200': { description: 'Preset list and available tags' } },
      },
    },
    '/presets/{id}': {
      get: {
        tags: ['Settings'],
        summary: 'Get one preset by ID',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Preset' },
          '404': { description: 'Not found' },
        },
      },
    },
    '/settings': {
      get: {
        tags: ['Settings'],
        summary: 'Global defaults and presets',
        responses: { '200': { description: 'Settings' } },
      },
      put: {
        tags: ['Settings'],
        summary: 'Save global configuration (administrative)',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/SettingsDocument' } },
          },
        },
        responses: {
          '200': { description: 'Configuration saved' },
          '409': { description: 'Revision conflict' },
        },
      },
    },
  },
  components: {
    schemas: {
      TrackSelection: {
        oneOf: [
          { type: 'string', enum: ['all', 'default', 'none'] },
          {
            type: 'object',
            required: ['languages'],
            properties: { languages: { type: 'array', items: { type: 'string' } } },
          },
        ],
      },
      DownloadOptions: {
        type: 'object',
        properties: {
          container: { type: 'string', enum: ['source', 'mkv', 'mp4', 'webm'] },
          quality: {
            type: 'string',
            enum: ['original', '2160p', '1440p', '1080p', '720p', '480p', '360p'],
          },
          videoCodec: { type: 'string', enum: ['copy', 'h264', 'h265', 'vp9', 'av1'] },
          audioCodec: {
            type: 'string',
            enum: ['copy', 'aac', 'ac3', 'eac3', 'opus', 'flac', 'mp3'],
          },
          audioSelection: { $ref: '#/components/schemas/TrackSelection' },
          audioStreamIndices: { type: 'array', items: { type: 'integer' } },
          audioPackaging: { type: 'string', enum: ['mux', 'separate'] },
          subtitleSelection: { $ref: '#/components/schemas/TrackSelection' },
          subtitleStreamIndices: { type: 'array', items: { type: 'integer' } },
          subtitleStrategy: {
            type: 'string',
            enum: ['mirror-source', 'muxed', 'separate', 'burn', 'none'],
          },
          subtitlePackaging: {
            type: 'object',
            additionalProperties: { type: 'string', enum: ['mux', 'separate', 'burn'] },
          },
          hardwareAcceleration: { type: 'boolean' },
        },
      },
      CreateDownloadRequest: {
        type: 'object',
        required: ['movieId'],
        properties: {
          movieId: { type: 'string' },
          mediaSourceId: { type: 'string' },
          preset: { type: 'string' },
          options: { $ref: '#/components/schemas/DownloadOptions' },
        },
      },
      CheckRequest: {
        type: 'object',
        required: ['movieId'],
        properties: {
          movieId: { type: 'string' },
          mediaSourceId: { type: 'string' },
          preset: { type: 'string' },
          options: { $ref: '#/components/schemas/DownloadOptions' },
        },
      },
      BatchDownloadRequest: {
        type: 'object',
        required: ['movieIds'],
        properties: {
          movieIds: {
            type: 'array',
            minItems: 1,
            maxItems: 50,
            items: { type: 'string' },
          },
          mediaSourceId: { type: 'string' },
          preset: { type: 'string' },
          options: { $ref: '#/components/schemas/DownloadOptions' },
        },
      },
      SettingsDocument: {
        type: 'object',
        required: ['schemaVersion', 'revision', 'updatedAt', 'defaults', 'presets'],
        properties: {
          schemaVersion: { type: 'integer', const: 1 },
          revision: { type: 'integer' },
          updatedAt: { type: 'string', format: 'date-time' },
          defaults: { type: 'object' },
          presets: { type: 'array', items: { $ref: '#/components/schemas/Preset' } },
        },
      },
      Preset: {
        type: 'object',
        required: ['id', 'name', 'tags', 'options'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          tags: {
            type: 'array',
            items: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{0,31}$' },
          },
          options: { $ref: '#/components/schemas/DownloadOptions' },
        },
      },
    },
  },
} as const
