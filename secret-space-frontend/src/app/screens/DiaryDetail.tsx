import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { MobileContainer } from '../components/MobileContainer';
import { Button } from '../components/Button';
import { ArrowLeft, Heart, Send, Plus, Pencil, Trash2, X, Check } from 'lucide-react';
import { diaryApi, DiaryEntry } from '../api/diary';
import { triggerSync, onSync } from '../services/eventBus';

const EMOJIS = ['❤️', '😂', '😮', '😢', '🔥', '🙏'];

export default function DiaryDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  
  const [entry, setEntry] = useState<DiaryEntry | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const [commentText, setCommentText] = useState('');
  const [liked, setLiked] = useState(false);
  const [isLiking, setIsLiking] = useState(false);
  const [isCommenting, setIsCommenting] = useState(false);
  const [activeReactionCommentId, setActiveReactionCommentId] = useState<string | null>(null);

  // Edit/Delete state
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isTombstone = entry?.content?.startsWith('🗑️') && entry?.author === 'partner';

  const handleEdit = async () => {
    if (!id || !editContent.trim() || isSavingEdit) return;
    setIsSavingEdit(true);
    try {
      await diaryApi.editEntry(id, editContent.trim());
      setEntry(prev => prev ? { ...prev, content: editContent.trim() } : null);
      setIsEditing(false);
      triggerSync();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDelete = async () => {
    if (!id || isDeleting) return;
    setIsDeleting(true);
    try {
      await diaryApi.deleteEntry(id);
      triggerSync();
      navigate('/diary');
    } catch (e) {
      console.error(e);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleReact = async (commentId: string, emoji: string) => {
    setActiveReactionCommentId(null);
    if (!id || !entry) return;

    // Optimistically update
    setEntry(prev => {
      if (!prev) return prev;
      const updatedComments = prev.commentsList?.map(comment => {
        if (comment.id !== commentId) return comment;
        
        let found = false;
        const newReactions = (comment.reactions || []).map(r => {
          if (r.emoji === emoji) {
            found = true;
            return {
              ...r,
              count: r.userReacted ? r.count - 1 : r.count + 1,
              userReacted: !r.userReacted
            };
          }
          return r;
        }).filter(r => r.count > 0);

        if (!found) {
          newReactions.push({ emoji, count: 1, userReacted: true });
        }

        return { ...comment, reactions: newReactions };
      });
      return { ...prev, commentsList: updatedComments };
    });

    try {
      await diaryApi.reactToComment(id, commentId, emoji);
    } catch(e) {
      console.error(e);
    }
  };

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
    
    // Cross-device realtime sync
    const interval = setInterval(fetchEntry, 5000);
    const unsubscribe = onSync(fetchEntry);
    
    return () => {
      clearInterval(interval);
      unsubscribe();
    };
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
    // using a temporary fake ID so reactions won't crash on newly added comments
    const newComment = { id: `temp-${Date.now()}`, author: 'You', text, timestamp: new Date().toISOString(), reactions: [] };
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
        <div className="sticky top-0 bg-background/95 backdrop-blur-sm z-10 p-6 pb-4 border-b border-border flex items-center justify-between">
          <button onClick={() => navigate('/diary')} className="focus:outline-none">
            <ArrowLeft className="w-6 h-6 text-warm-white" />
          </button>
          {/* Edit/Delete actions — only for your own non-tombstone text entries */}
          {entry.author === 'you' && !isTombstone && (
            <div className="flex items-center gap-2">
              {entry.type === 'text' && (
                <button
                  onClick={() => { setIsEditing(true); setEditContent(entry.content); }}
                  className="p-2 rounded-lg hover:bg-surface/50 transition-colors focus:outline-none"
                >
                  <Pencil className="w-5 h-5 text-muted-text" />
                </button>
              )}
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="p-2 rounded-lg hover:bg-rose/20 transition-colors focus:outline-none"
              >
                <Trash2 className="w-5 h-5 text-rose" />
              </button>
            </div>
          )}
        </div>

        {/* Delete Confirmation Dialog */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-near-black/80 backdrop-blur-sm p-6">
            <div className="bg-surface border border-border rounded-2xl p-6 max-w-sm w-full">
              <h3 className="text-lg font-bold text-warm-white mb-2">Delete this entry?</h3>
              <p className="text-sm text-muted-text mb-6">
                This entry will be replaced with a notice that you removed it. Your partner will still see that something was here.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-2.5 bg-surface/50 border border-border rounded-xl text-warm-white font-medium focus:outline-none"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="flex-1 py-2.5 bg-rose rounded-xl text-warm-white font-medium disabled:opacity-50 focus:outline-none"
                >
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Entry Content */}
        <div className="flex-1 p-6">
          <div className={`bg-surface/50 p-6 rounded-2xl border mb-6 ${isTombstone ? 'border-border/50 opacity-60' : 'border-border'}`}>
            {/* Author */}
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-12 h-12 rounded-full ${
                entry.author === 'you' 
                  ? 'bg-gradient-to-br from-rose/30 to-rose/10 border-2 border-rose' 
                  : 'bg-gradient-to-br from-gold/30 to-gold/10 border-2 border-gold'
              } flex items-center justify-center text-2xl`}>
                {isTombstone ? '🗑️' : '👤'}
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
            {isTombstone ? (
              <p className="text-muted-text italic leading-relaxed mb-6">
                {entry.content}
              </p>
            ) : isEditing ? (
              <div className="mb-6 space-y-3">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={4}
                  className="w-full px-4 py-3 bg-surface/70 border border-rose/50 rounded-xl text-warm-white placeholder:text-muted-text focus:outline-none focus:ring-2 focus:ring-rose/50 resize-none"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsEditing(false)}
                    className="flex-1 py-2.5 bg-surface/50 border border-border rounded-xl text-warm-white font-medium flex items-center justify-center gap-2 focus:outline-none"
                  >
                    <X className="w-4 h-4" /> Cancel
                  </button>
                  <button
                    onClick={handleEdit}
                    disabled={isSavingEdit || !editContent.trim()}
                    className="flex-1 py-2.5 bg-rose rounded-xl text-warm-white font-medium disabled:opacity-50 flex items-center justify-center gap-2 focus:outline-none"
                  >
                    <Check className="w-4 h-4" /> {isSavingEdit ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            ) : (entry.type === 'image' || (entry.type as string) === 'photo' || entry.content.startsWith('http')) ? (
              <div className="w-full mb-6 rounded-xl overflow-hidden bg-surface/50 border border-border">
                <img 
                  src={entry.content} 
                  alt="Diary Entry" 
                  className="w-full h-auto object-contain max-h-[60vh] bg-near-black" 
                />
              </div>
            ) : (
              <p className="text-warm-white leading-relaxed mb-6 whitespace-pre-wrap">
                {entry.content}
              </p>
            )}

            {/* Like Button — hide on tombstone entries */}
            {!isTombstone && (
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
            )}
          </div>

          {/* Comments */}
          <div className="space-y-4 mb-24">
            <h3 className="text-sm font-medium text-muted-text">Comments</h3>
            {entry.commentsList && entry.commentsList.length > 0 ? (
              entry.commentsList.map((comment, index) => (
                <div key={comment.id || index} className="bg-surface/30 p-4 rounded-xl border border-border relative">
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-sm font-medium text-warm-white">{comment.author}</p>
                    <span className="text-xs text-muted-text">
                      {formatTimestamp(comment.timestamp)}
                    </span>
                  </div>
                  <p className="text-sm text-warm-white mb-3">{comment.text}</p>
                  
                  {/* Reactions Bar */}
                  <div className="flex flex-wrap items-center gap-2">
                    {comment.reactions?.map(reaction => (
                      <button 
                        key={reaction.emoji}
                        onClick={() => handleReact(comment.id, reaction.emoji)}
                        className={`px-2 py-1 rounded-full text-xs flex items-center gap-1 border transition-colors focus:outline-none ${reaction.userReacted ? 'bg-rose/20 border-rose/50 text-rose font-medium' : 'bg-surface/50 border-border text-muted-text hover:border-rose/30'}`}
                      >
                        <span>{reaction.emoji}</span>
                        <span>{reaction.count}</span>
                      </button>
                    ))}
                    
                    <button 
                      onClick={() => setActiveReactionCommentId(activeReactionCommentId === comment.id ? null : comment.id)}
                      className="w-7 h-7 rounded-full bg-surface/50 border border-border flex items-center justify-center text-muted-text hover:text-rose hover:border-rose/30 transition-colors focus:outline-none active:scale-95"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Emoji Picker Popover */}
                  {activeReactionCommentId === comment.id && (
                    <div className="absolute top-full left-4 mt-2 z-20 bg-surface border border-border rounded-2xl shadow-xl p-2 flex gap-1 animate-in fade-in zoom-in duration-200">
                      {EMOJIS.map(emoji => (
                        <button
                          key={emoji}
                          onClick={() => handleReact(comment.id, emoji)}
                          className="w-10 h-10 flex items-center justify-center hover:bg-surface/50 rounded-xl text-xl transition-all focus:outline-none active:scale-90 hover:-translate-y-1"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
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
