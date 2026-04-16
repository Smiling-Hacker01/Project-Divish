import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { MobileContainer } from '../components/MobileContainer';
import { Button } from '../components/Button';
import { ArrowLeft, Heart, Send } from 'lucide-react';
import { diaryApi, DiaryEntry } from '../api/diary';

export default function DiaryDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  
  const [entry, setEntry] = useState<DiaryEntry | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const [commentText, setCommentText] = useState('');
  const [liked, setLiked] = useState(false);
  const [isLiking, setIsLiking] = useState(false);
  const [isCommenting, setIsCommenting] = useState(false);

  useEffect(() => {
    const fetchEntry = async () => {
      if (!id) return;
      try {
        const data = await diaryApi.getEntry(id);
        setEntry(data);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchEntry();
  }, [id]);

  const handleLike = async () => {
    if (!entry || !id || isLiking) return;
    
    const newLiked = !liked;
    setLiked(newLiked);
    setIsLiking(true);
    
    // Optimistic UI update
    setEntry(prev => prev ? { ...prev, likes: prev.likes + (newLiked ? 1 : -1) } : null);
    
    try {
      await diaryApi.likeEntry(id, newLiked);
    } catch (e) {
      console.error(e);
      // Revert optimistic update on failure
      setLiked(!newLiked);
      setEntry(prev => prev ? { ...prev, likes: prev.likes + (!newLiked ? 1 : -1) } : null);
    } finally {
      setIsLiking(false);
    }
  };

  const handleComment = async () => {
    if (!entry || !id || !commentText.trim() || isCommenting) return;
    
    const text = commentText;
    setCommentText(''); // Optimistically clear input
    setIsCommenting(true);
    
    // Optimistic UI update
    const newComment = { author: 'You', text, timestamp: new Date().toISOString() };
    setEntry(prev => prev ? { 
      ...prev, 
      comments: prev.comments + 1,
      commentsList: [...(prev.commentsList || []), newComment] 
    } : null);

    try {
      await diaryApi.addComment(id, text);
    } catch (e) {
      console.error(e);
      // Fallback: fetch entry again on failure to sync state
      const data = await diaryApi.getEntry(id);
      setEntry(data);
    } finally {
      setIsCommenting(false);
    }
  };

  if (isLoading) {
    return (
      <MobileContainer>
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-muted-text">Loading...</p>
        </div>
      </MobileContainer>
    );
  }

  if (!entry) {
    return (
      <MobileContainer>
        <div className="min-h-screen flex flex-col items-center justify-center p-6">
          <p className="text-muted-text mb-6">Entry not found</p>
          <Button variant="secondary" onClick={() => navigate('/diary')}>Go Back</Button>
        </div>
      </MobileContainer>
    );
  }

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  return (
    <MobileContainer>
      <div className="min-h-screen flex flex-col">
        {/* Header */}
        <div className="sticky top-0 bg-background/95 backdrop-blur-sm z-10 p-6 pb-4 border-b border-border">
          <button onClick={() => navigate('/diary')} className="focus:outline-none">
            <ArrowLeft className="w-6 h-6 text-warm-white" />
          </button>
        </div>

        {/* Entry Content */}
        <div className="flex-1 p-6">
          <div className="bg-surface/50 p-6 rounded-2xl border border-border mb-6">
            {/* Author */}
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-12 h-12 rounded-full ${
                entry.author === 'you' 
                  ? 'bg-gradient-to-br from-rose/30 to-rose/10 border-2 border-rose' 
                  : 'bg-gradient-to-br from-gold/30 to-gold/10 border-2 border-gold'
              } flex items-center justify-center text-2xl`}>
                👤
              </div>
              <div>
                <p className="text-warm-white font-medium">
                  {entry.author === 'you' ? 'You' : 'Partner'}
                </p>
                <p className="text-xs text-muted-text">
                  {formatTimestamp(entry.timestamp)}
                </p>
              </div>
            </div>

            {/* Content */}
            <p className="text-warm-white leading-relaxed mb-4 whitespace-pre-wrap">
              {entry.content}
            </p>

            {/* Like Button */}
            <button
              onClick={handleLike}
              disabled={isLiking}
              className={`flex items-center gap-2 transition-colors focus:outline-none ${
                liked ? 'text-rose' : 'text-muted-text hover:text-rose'
              }`}
            >
              <Heart className={`w-6 h-6 ${liked ? 'fill-rose' : ''}`} />
              <span>{entry.likes}</span>
            </button>
          </div>

          {/* Comments */}
          <div className="space-y-4 mb-24">
            <h3 className="text-sm font-medium text-muted-text">Comments</h3>
            {entry.commentsList && entry.commentsList.length > 0 ? (
              entry.commentsList.map((comment, index) => (
                <div key={index} className="bg-surface/30 p-4 rounded-xl border border-border">
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-sm font-medium text-warm-white">{comment.author}</p>
                    <span className="text-xs text-muted-text">
                      {formatTimestamp(comment.timestamp)}
                    </span>
                  </div>
                  <p className="text-sm text-warm-white">{comment.text}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-text text-center py-4">
                No comments yet
              </p>
            )}
          </div>
        </div>

        {/* Comment Input - Fixed at bottom */}
        <div className="sticky bottom-0 bg-background/95 backdrop-blur-sm border-t border-border p-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Add a comment..."
              className="flex-1 px-4 py-3 bg-surface/50 border border-border rounded-xl text-warm-white placeholder:text-muted-text focus:outline-none focus:ring-2 focus:ring-rose/50 focus:border-rose appearance-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleComment();
                }
              }}
            />
            <button
              onClick={handleComment}
              disabled={!commentText.trim() || isCommenting}
              className="px-4 py-3 bg-rose rounded-xl text-warm-white hover:bg-rose/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </MobileContainer>
  );
}
