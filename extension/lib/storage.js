/**
 * Storage Adapter Abstraction
 */
export class StorageAdapter {
  async getBookmarks() { throw new Error('Not implemented'); }
  async saveBookmarks(data) { throw new Error('Not implemented'); }
}

/**
 * GitHub Storage Adapter
 */
export class GitHubAdapter extends StorageAdapter {
  constructor(config) {
    super();
    this.token = config.token;
    this.repo = config.repo;
    this.owner = config.owner;
    this.path = config.path || 'bookmarks.json';
    this.baseUrl = 'https://api.github.com';
  }

  async _request(endpoint, options = {}) {
    // Add a timestamp to the URL for GET requests to bypass any caching
    const url = new URL(`${this.baseUrl}/repos/${this.owner}/${this.repo}/contents/${this.path}`);
    if (!options.method || options.method === 'GET') {
      url.searchParams.set('t', Date.now());
    }

    const headers = {
      'Authorization': `token ${this.token}`,
      'Accept': 'application/vnd.github+json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      ...options.headers
    };
    
    let lastError;
    for (let i = 0; i < 3; i++) { // Retry 3 times
      try {
        const response = await fetch(url.toString(), { ...options, headers });
        if (response.status === 404 && options.method !== 'PUT') return null;
        
        if (!response.ok) {
          const errorText = await response.text();
          let errorInfo;
          try {
            errorInfo = JSON.parse(errorText);
          } catch (e) {
            errorInfo = { message: errorText };
          }
          
          const error = new Error(`GitHub API error: ${response.status} - ${JSON.stringify(errorInfo)}`);
          error.status = response.status;
          error.info = errorInfo;
          throw error;
        }
        
        const text = await response.text();
        if (!text || text.trim() === '') return {};
        try {
          return JSON.parse(text);
        } catch (e) {
          console.error('JSON parse error in _request:', e, 'Text:', text);
          return {};
        }
      } catch (e) {
        // If it's a 409 Conflict, don't retry here, let the caller handle it (e.g., in saveBookmarks)
        if (e.status === 409) throw e;

        console.warn(`Attempt ${i+1} failed:`, e.message);
        lastError = e;
        if (i < 2) await new Promise(r => setTimeout(r, 1000 * (i + 1))); // Wait before retry
      }
    }
    throw lastError;
  }

  async getBookmarks() {
    try {
      const data = await this._request('');
      if (!data) return { bookmarks: [], lastSync: 0 };
      
      let rawData;
      if (!data.content && data.download_url) {
        console.log('File too large, fetching via download_url...');
        const res = await fetch(data.download_url);
        if (!res.ok) throw new Error('Download failed');
        rawData = await res.arrayBuffer();
      } else if (data.content) {
        const base64 = data.content.replace(/\s/g, '');
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        rawData = bytes.buffer;
      } else {
        return { bookmarks: [], lastSync: 0 };
      }

      // Try decompression (Gzip)
      try {
        const stream = new Blob([rawData]).stream();
        const decompressedStream = stream.pipeThrough(new DecompressionStream('gzip'));
        const decompressedBlob = await new Response(decompressedStream).blob();
        const text = await decompressedBlob.text();
        return JSON.parse(text);
      } catch (e) {
        // If decompression fails, it's likely old uncompressed JSON
        console.log('Decompression failed, trying as plain JSON...');
        const text = new TextDecoder().decode(rawData);
        return JSON.parse(text);
      }
    } catch (e) {
      console.error('GitHub getBookmarks error:', e);
      if (e.message && e.message.includes('404')) return { bookmarks: [], lastSync: 0 };
      throw e;
    }
  }

  _cleanNode(node) {
    const cleaned = {
      title: node.title
    };
    if (node.url) {
      cleaned.url = node.url;
    }
    if (node.children) {
      cleaned.children = node.children.map(c => this._cleanNode(c));
    }
    return cleaned;
  }

  async saveBookmarks(data) {
    const performSave = async () => {
      const existing = await this._request('');
      
      // Clean data before saving to minimize size
      const cleanedData = {
        lastSync: data.lastSync,
        bookmarks: data.bookmarks.map(node => this._cleanNode(node))
      };
      
      const jsonString = JSON.stringify(cleanedData);
      
      // Use Gzip compression
      const stream = new Blob([jsonString]).stream();
      const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));
      const compressedBlob = await new Response(compressedStream).blob();
      const buffer = await compressedBlob.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const content = await this._bytesToBase64(bytes);

      // GitHub Content API limit is 1MB for the request body.
      // Base64 is ~33% larger than binary. 
      // We check if the content alone is approaching the limit.
      if (content.length > 900000) { // ~900KB
        throw new Error('Bookmarks file too large for GitHub API (exceeds 1MB limit even after compression). Please reduce number of bookmarks.');
      }

      const body = {
        message: 'Update bookmarks (compressed) via Sync Extension',
        content,
        sha: existing ? existing.sha : undefined
      };
      
      return this._request('', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    };

    try {
      return await performSave();
    } catch (e) {
      if (e.status === 409) {
        console.warn('GitHub 409 Conflict detected. Retrying with fresh SHA...');
        // Wait a bit to let any concurrent operations settle
        await new Promise(r => setTimeout(r, 1000));
        return await performSave();
      }
      throw e;
    }
  }

  // Helper for efficient large-scale Base64 conversion
  async _bytesToBase64(bytes) {
    // In Service Workers, FileReader might not be available. 
    // Using a more compatible approach for large chunks.
    let binary = '';
    const len = bytes.byteLength;
    const chunk_size = 0x8000; // 32KB chunks to avoid stack overflow
    for (let i = 0; i < len; i += chunk_size) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk_size));
    }
    return btoa(binary);
  }
}
