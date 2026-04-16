import { apiClient } from './client';

export interface DiaryComment {
  author: string;
  text: string;
  timestamp: string;
}

export interface DiaryEntry {
  id: string;
  author: 'you' | 'partner';
  type: 'text' | 'photo' | 'video';
  content: string;
  timestamp: string;
  likes: number;
  comments: number;
  commentsList?: DiaryComment[];
}

export const diaryApi = {
  getEntries: async (): Promise<DiaryEntry[]> => {
    const res = await apiClient.get<DiaryEntry[]>('/diary');
    return res.data;
  },

  getEntry: async (id: string): Promise<DiaryEntry> => {
    const res = await apiClient.get<DiaryEntry>(`/diary/${id}`);
    return res.data;
  },

  createEntry: async (data: Partial<DiaryEntry>) => {
    const res = await apiClient.post('/diary', data);
    return res.data;
  },

  likeEntry: async (id: string, liked: boolean) => {
    const res = await apiClient.post(`/diary/${id}/like`, { liked });
    return res.data;
  },

  addComment: async (id: string, text: string) => {
    const res = await apiClient.post(`/diary/${id}/comments`, { text });
    return res.data;
  },

  deleteEntry: async (id: string) => {
    const res = await apiClient.delete(`/diary/${id}`);
    return res.data;
  }
};
