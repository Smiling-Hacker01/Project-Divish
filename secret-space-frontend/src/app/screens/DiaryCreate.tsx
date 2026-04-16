import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../components/Button';
import { MobileContainer } from '../components/MobileContainer';
import { ArrowLeft, Type, Image, Video } from 'lucide-react';
import { diaryApi } from '../api/diary';

type EntryType = 'text' | 'photo' | 'video';

export default function DiaryCreate() {
  const navigate = useNavigate();
  const [entryType, setEntryType] = useState<EntryType>('text');
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handlePost = async () => {
    setIsSubmitting(true);
    try {
      await diaryApi.createEntry({ type: entryType, content });
      navigate('/diary');
    } catch (e) {
      console.error(e);
      setIsSubmitting(false);
    }
  };

  return (
    <MobileContainer>
      <div className="min-h-screen flex flex-col p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <button onClick={() => navigate('/diary')} className="focus:outline-none">
            <ArrowLeft className="w-6 h-6 text-warm-white" />
          </button>
          <h1 className="text-xl font-bold text-warm-white">New Entry</h1>
          <div className="w-6" />
        </div>

        {/* Type Selector */}
        <div className="flex gap-2 mb-6 p-1 bg-surface/50 rounded-xl">
          <button
            onClick={() => setEntryType('text')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg transition-all focus:outline-none ${
              entryType === 'text'
                ? 'bg-rose text-warm-white'
                : 'text-muted-text hover:text-warm-white'
            }`}
          >
            <Type className="w-4 h-4" />
            <span className="text-sm font-medium">Text</span>
          </button>
          <button
            onClick={() => setEntryType('photo')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg transition-all focus:outline-none ${
              entryType === 'photo'
                ? 'bg-rose text-warm-white'
                : 'text-muted-text hover:text-warm-white'
            }`}
          >
            <Image className="w-4 h-4" />
            <span className="text-sm font-medium">Photo</span>
          </button>
          <button
            onClick={() => setEntryType('video')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg transition-all focus:outline-none ${
              entryType === 'video'
                ? 'bg-rose text-warm-white'
                : 'text-muted-text hover:text-warm-white'
            }`}
          >
            <Video className="w-4 h-4" />
            <span className="text-sm font-medium">Video</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 mb-6">
          {entryType === 'text' && (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What's on your mind?"
              className="w-full h-64 p-4 bg-surface/50 border border-border rounded-2xl text-warm-white placeholder:text-muted-text focus:outline-none focus:ring-2 focus:ring-rose/50 focus:border-rose resize-none"
            />
          )}

          {entryType === 'photo' && (
            <div className="w-full h-64 bg-surface/50 border-2 border-dashed border-border rounded-2xl flex flex-col items-center justify-center text-muted-text hover:border-rose/50 transition-all cursor-pointer">
              <Image className="w-12 h-12 mb-3" />
              <p className="text-sm">Tap to select a photo</p>
              <p className="text-xs mt-1">Or take a new one</p>
            </div>
          )}

          {entryType === 'video' && (
            <div className="w-full h-64 bg-surface/50 border-2 border-dashed border-border rounded-2xl flex flex-col items-center justify-center text-muted-text hover:border-rose/50 transition-all cursor-pointer">
              <Video className="w-12 h-12 mb-3" />
              <p className="text-sm">Tap to select a video</p>
              <p className="text-xs mt-1">Or record a new one</p>
            </div>
          )}
        </div>

        {/* Post Button */}
        <Button
          variant="primary"
          fullWidth
          onClick={handlePost}
          disabled={(entryType === 'text' && !content) || isSubmitting}
        >
          {isSubmitting ? 'Posting...' : 'Post Entry'}
        </Button>
      </div>
    </MobileContainer>
  );
}
