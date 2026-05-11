import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { VoiceRecorder } from 'capacitor-voice-recorder';
import { socketManager } from '../services/socket';
import { apiClient } from '../api/client';
import { 
  generateRSAKeyPair, 
  generateAESKey, 
  encryptAESKeyWithRSA, 
  encryptTextAES, 
  decryptAESKeyWithRSA, 
  decryptTextAES 
} from '../services/encryption';
import { ArrowLeft, Send, Mic, Square, Lock, Check, CheckCheck, Trash2, X, Play, Pause } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

interface ChatMessage {
  id: string;
  coupleId: string;
  senderId: string;
  content: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  senderAesKey: string | null;
  recipientAesKey: string | null;
  status: 'sent' | 'delivered' | 'read';
  createdAt: string;
  deletedForSender?: boolean;
  deletedForEveryone?: boolean;
  reactions?: Record<string, string>;
  deliveredAt?: string;
  readAt?: string;
}

export default function Chat() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [pendingAudio, setPendingAudio] = useState<string | null>(null);
  
  const [partnerPublicKey, setPartnerPublicKey] = useState<string | null>(null);
  const [myPrivateKey, setMyPrivateKey] = useState<string | null>(null);
  const [myPublicKey, setMyPublicKey] = useState<string | null>(null);
  const [decryptedCache, setDecryptedCache] = useState<Record<string, string>>({});
  const [isReady, setIsReady] = useState(false);
  
  // Presence & Typing State
  const [partnerOnline, setPartnerOnline] = useState(false);
  const [partnerTyping, setPartnerTyping] = useState(false);
  let typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Context Menus
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);

  const virtuosoRef = useRef<VirtuosoHandle>(null);

  // ── Initialization & E2EE Key Management ──────────────────────────────────
  useEffect(() => {
    let active = true;

    const setupKeys = async () => {
      try {
        let priv = localStorage.getItem('rsaPrivateKey');
        let pub = localStorage.getItem('rsaPublicKey');
        
        if (!priv || !pub) {
          const keys = await generateRSAKeyPair();
          priv = keys.privateKey;
          pub = keys.publicKey;
          localStorage.setItem('rsaPrivateKey', priv);
          localStorage.setItem('rsaPublicKey', pub);
          await apiClient.put('/chat/keys', { publicKey: pub });
        }
        
        if (active) {
          setMyPrivateKey(priv);
          setMyPublicKey(pub);
        }

        const partnerId = user?.partnerId;
        if (partnerId) {
          try {
            const res = await apiClient.get<{ publicKey: string }>(`/chat/keys/${partnerId}`);
            if (active) setPartnerPublicKey(res.data.publicKey);
          } catch (e) {
            console.error('[Chat] Failed to fetch partner public key', e);
          }
        }
        
        if (active) setIsReady(true);
      } catch(e) {
         console.error("[Chat] E2EE Init error", e);
      }
    };

    setupKeys();
    return () => { active = false; };
  }, [user]);

  // Load chat history & Socket setup
  useEffect(() => {
    socketManager.connect();
    
    const loadHistory = async () => {
      try {
        const res = await apiClient.get('/chat/history');
        const reversedMessages = [...res.data.messages].reverse();
        setMessages(reversedMessages);
        
        // Mark unread as read immediately on load if connected
        const unreadIds = reversedMessages
          .filter((m: ChatMessage) => m.senderId !== user?.id && m.status !== 'read')
          .map((m: ChatMessage) => m.id);
        
        if (unreadIds.length > 0) {
          socketManager.emit('read_receipt', unreadIds);
        }

        // Wait for rendering then scroll down
        setTimeout(() => virtuosoRef.current?.scrollToIndex({ index: reversedMessages.length - 1 }), 100);
      } catch (err) {
         console.error('[Chat] Failed to load history', err);
      }
    };
    loadHistory();

    const handleNewMessage = (msg: ChatMessage) => {
      setMessages(prev => [...prev, msg]);
      if (msg.senderId !== user?.id) {
        socketManager.emit('read_receipt', [msg.id]);
      }
      setTimeout(() => virtuosoRef.current?.scrollToIndex({ index: 'LAST', behavior: 'smooth' }), 50);
    };

    const handleBatchStatus = (data: { messageIds: string[], status: 'delivered' | 'read' }) => {
      setMessages(prev => prev.map(m => 
        data.messageIds.includes(m.id) ? { ...m, status: data.status, [data.status === 'read' ? 'readAt' : 'deliveredAt']: new Date().toISOString() } : m
      ));
    };

    const handleSingleStatus = (data: { messageId: string, status: string }) => {
      setMessages(prev => prev.map(m => 
        m.id === data.messageId ? { ...m, status: data.status as any, [data.status === 'read' ? 'readAt' : 'deliveredAt']: new Date().toISOString() } : m
      ));
    };

    const handlePresence = (data: { userId: string, status: 'online' | 'offline' }) => {
      if (data.userId !== user?.id) {
        setPartnerOnline(data.status === 'online');
        // Let them know we delivered all sent messages if they come online
        if (data.status === 'online') {
            setMessages(prev => {
                const undeliveredIds = prev.filter(m => m.senderId === data.userId && m.status === 'sent').map(m => m.id);
                if (undeliveredIds.length > 0) socketManager.emit('delivered_receipt', undeliveredIds);
                return prev;
            });
        }
      }
    };

    const handleTyping = (data: { userId: string, isTyping: boolean }) => {
      if (data.userId !== user?.id) {
        setPartnerTyping(data.isTyping);
      }
    };

    const handleReaction = (data: { messageId: string, userId: string, emoji: string, reactions: any }) => {
      setMessages(prev => prev.map(m => m.id === data.messageId ? { ...m, reactions: data.reactions } : m));
    };

    const handleDeleted = (data: { messageId: string, type: string }) => {
      setMessages(prev => prev.map(m => {
        if (m.id === data.messageId) {
           if (data.type === 'for_everyone') return { ...m, deletedForEveryone: true, content: null, mediaUrl: null };
           if (data.type === 'for_me' && m.senderId === user?.id) return { ...m, deletedForSender: true };
        }
        return m;
      }));
    };

    socketManager.on('receive_message', handleNewMessage);
    socketManager.on('message_status_batch', handleBatchStatus);
    socketManager.on('message_status', handleSingleStatus);
    socketManager.on('partner_presence', handlePresence);
    socketManager.on('typing', handleTyping);
    socketManager.on('message_reaction', handleReaction);
    socketManager.on('message_deleted', handleDeleted);

    return () => {
      socketManager.off('receive_message', handleNewMessage);
      socketManager.off('message_status_batch', handleBatchStatus);
      socketManager.off('message_status', handleSingleStatus);
      socketManager.off('partner_presence', handlePresence);
      socketManager.off('typing', handleTyping);
      socketManager.off('message_reaction', handleReaction);
      socketManager.off('message_deleted', handleDeleted);
    };
  }, [user?.id]);

  // Decryption Effect
  useEffect(() => {
    let active = true;
    const processDecryption = async () => {
      if (!myPrivateKey) return;
      
      const newCache = { ...decryptedCache };
      let updated = false;

      for (const msg of messages) {
        if (msg.deletedForEveryone) continue; 
        if (!newCache[msg.id] && msg.content) {
          try {
            const isMe = msg.senderId === user?.id;
            const wrappedKey = isMe ? msg.senderAesKey : msg.recipientAesKey;

            if (wrappedKey) {
              const aesKey = await decryptAESKeyWithRSA(wrappedKey, myPrivateKey);
              const plainText = await decryptTextAES(msg.content, aesKey);
              newCache[msg.id] = plainText;
              updated = true;
            } else {
              newCache[msg.id] = msg.content;
              updated = true;
            }
          } catch (e) {
            newCache[msg.id] = "🚫 Decryption Error";
            updated = true;
          }
        }
      }

      if (updated && active) setDecryptedCache(newCache);
    };
    
    processDecryption();
    return () => { active = false; };
  }, [messages, myPrivateKey, user?.id]);


  // ── Input Sending Flow ─────────────────────────────────────────────────────
  const emitTyping = () => {
    socketManager.emit('typing', true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socketManager.emit('typing', false);
    }, 2000);
  };

  const sendSecureMessage = async (rawContent: string, mediaType: 'text' | 'voice' = 'text') => {
    if (!rawContent.trim() && mediaType === 'text') return;
    if (!isReady || !myPublicKey) return;

    try {
      const aesKey = await generateAESKey();
      const encryptedContent = await encryptTextAES(rawContent, aesKey);

      let recipientAesKey = null;
      if (partnerPublicKey) {
        recipientAesKey = await encryptAESKeyWithRSA(aesKey, partnerPublicKey);
      }
      const senderAesKey = await encryptAESKeyWithRSA(aesKey, myPublicKey);

      const tempId = `temp-${Date.now()}`;
      const optimisticMsg: ChatMessage = {
        id: tempId,
        coupleId: '',
        senderId: user?.id || '',
        content: encryptedContent,
        mediaUrl: null,
        mediaType,
        senderAesKey,
        recipientAesKey,
        status: 'sent',
        createdAt: new Date().toISOString()
      };
      
      setMessages(prev => [...prev, optimisticMsg]);
      setDecryptedCache(prev => ({ ...prev, [tempId]: rawContent }));
      setInputText('');
      setPendingAudio(null);

      socketManager.emit('typing', false);

      socketManager.emit('send_message', { 
        content: encryptedContent,
        mediaType,
        senderAesKey,
        recipientAesKey
      }, (res: any) => {
        if (res.status === 'ok') {
          setMessages(prev => prev.map(m => m.id === tempId ? res.message : m));
          setDecryptedCache(prev => {
            const next = { ...prev };
            next[res.message.id] = rawContent;
            delete next[tempId];
            return next;
          });
        }
      });

      setTimeout(() => virtuosoRef.current?.scrollToIndex({ index: 'LAST', behavior: 'smooth' }), 50);

    } catch (err) {
      console.error('[Chat] Send failed', err);
    }
  };

  const handleVoiceRecord = async () => {
    if (isRecording) {
      try {
        const result = await VoiceRecorder.stopRecording();
        setIsRecording(false);
        if (result.value && result.value.recordDataBase64) {
          // Instead of sending instantly, we queue it in pendingAudio preview
          setPendingAudio(result.value.recordDataBase64);
        }
      } catch (e) {
        setIsRecording(false);
      }
    } else {
      try {
        const permission = await VoiceRecorder.requestAudioRecordingPermission();
        if (permission.value) {
          setIsRecording(true);
          await VoiceRecorder.startRecording();
        }
      } catch (e) {}
    }
  };
  
  // ── Long Press Actions ───────────────────────────────────────────────────
  const reactToMessage = (messageId: string, emoji: string) => {
    socketManager.emit('react_message', { messageId, emoji });
    setSelectedMessageId(null);
  };

  const deleteMessage = (messageId: string, type: 'for_me' | 'for_everyone') => {
    socketManager.emit('delete_message', { messageId, type });
    setSelectedMessageId(null);
  };


  // ── Render Frame ──────────────────────────────────────────────────────────
  const renderMessage = (index: number, msg: ChatMessage) => {
    if (msg.deletedForSender && msg.senderId === user?.id) return null; // Hidden for sender if deleted merely for them

    const isMe = msg.senderId === user?.id;
    const content = decryptedCache[msg.id];
    const isDeleted = msg.deletedForEveryone;
    const hasReactions = msg.reactions && Object.keys(msg.reactions).length > 0;
    const isSelected = selectedMessageId === msg.id;
    
    // Day separator
    const prevMsg = messages[index - 1];
    const currentDate = format(new Date(msg.createdAt), 'yyyy-MM-dd');
    const prevDate = prevMsg ? format(new Date(prevMsg.createdAt), 'yyyy-MM-dd') : null;
    const showDateSeparator = currentDate !== prevDate;

    return (
      <div key={msg.id} className="relative">
        {showDateSeparator && (
          <div className="flex justify-center my-4">
            <span className="text-[11px] font-medium text-stone-400 bg-stone-200/50 dark:bg-stone-800/50 px-3 py-1 rounded-full">
              {format(new Date(msg.createdAt), 'MMMM d, yyyy')}
            </span>
          </div>
        )}
        
        {/* Selection Overlay for Context Menu */}
        <AnimatePresence>
          {isSelected && (
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 z-10 bg-black/20 dark:bg-black/40 flex items-center justify-center p-2 rounded-lg"
              onClick={() => setSelectedMessageId(null)}
            >
               <motion.div 
                 initial={{ scale: 0.9, y: 10 }} animate={{ scale: 1, y: 0 }}
                 className="bg-white dark:bg-stone-800 rounded-xl shadow-xl border border-stone-200 dark:border-stone-700 p-3 flex flex-col gap-3"
                 onClick={e => e.stopPropagation()}
               >
                 <div className="flex space-x-3 text-2xl px-2">
                    {['❤️', '😂', '😮', '😢', '🙏'].map(emoji => (
                       <button key={emoji} onClick={() => reactToMessage(msg.id, emoji)} className="hover:scale-125 transition-transform">
                          {emoji}
                       </button>
                    ))}
                 </div>
                 <div className="h-px bg-stone-100 dark:bg-stone-700 w-full" />
                 <button onClick={() => deleteMessage(msg.id, 'for_me')} className="text-sm font-medium text-stone-700 dark:text-stone-300 text-left px-2 py-1 hover:bg-stone-100 dark:hover:bg-stone-700 rounded-lg">Delete for me</button>
                 {isMe && (
                   <button onClick={() => deleteMessage(msg.id, 'for_everyone')} className="text-sm font-medium text-rose-500 text-left px-2 py-1 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg">Delete for everyone</button>
                 )}
               </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className={`flex w-full mb-3 px-4 ${isMe ? 'justify-end' : 'justify-start'}`}>
          <div 
            onContextMenu={e => { e.preventDefault(); setSelectedMessageId(msg.id); }}
            className={`max-w-[80%] px-4 py-2.5 rounded-2xl relative shadow-sm cursor-pointer transition-transform ${
              isDeleted 
                ? 'bg-transparent border border-stone-300 dark:border-stone-600 border-dashed text-stone-500 italic rounded-br-2xl rounded-bl-2xl'
                : isMe 
                  ? 'bg-rose-500 text-white rounded-br-sm' 
                  : 'bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 rounded-bl-sm border border-stone-100 dark:border-stone-700'
            }`}
          >
            {isDeleted ? (
               <div className="flex items-center space-x-2 text-[14px]">
                 <Trash2 size={14} className="opacity-50" />
                 <span>This message was deleted</span>
               </div>
            ) : content === undefined ? (
               <div className="flex items-center space-x-2 py-1 opacity-50 italic text-sm">
                 <Lock size={12} />
                 <span>Decrypting...</span>
               </div>
            ) : msg.mediaType === 'voice' ? (
               <audio 
                 src={`data:audio/aac;base64,${content}`} 
                 controls 
                 className={`h-10 w-48 ${isMe ? 'filter invert brightness-200' : ''}`} 
               />
            ) : (
               <p className="text-[15px] leading-relaxed break-words whitespace-pre-wrap">{content}</p>
            )}
            
            <div className={`flex items-center justify-end mt-1 space-x-1 ${isDeleted ? 'text-stone-400' : isMe ? 'text-rose-200' : 'text-stone-400'}`}>
              <span className="text-[10px]">{format(new Date(msg.createdAt), 'p')}</span>
              {isMe && !isDeleted && (
                 msg.status === 'read' ? <span title={`Read: ${msg.readAt}`}><CheckCheck size={12} className="text-blue-300" /></span> :
                 msg.status === 'delivered' ? <span title={`Delivered: ${msg.deliveredAt}`}><CheckCheck size={12} /></span> :
                 <Check size={12} />
              )}
            </div>

            {hasReactions && !isDeleted && (
              <div className={`absolute -bottom-3 ${isMe ? '-left-2' : '-right-2'} bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-full px-1.5 py-0.5 shadow-sm text-sm flex space-x-0.5`}>
                 {Object.values(msg.reactions as Record<string,string>).map((emoji, i) => (
                    <span key={i}>{emoji}</span>
                 ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-screen bg-stone-50 dark:bg-stone-900">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800 shrink-0 sticky top-0 z-20 pt-safe shadow-sm">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-stone-800 dark:text-stone-200">
          <ArrowLeft size={24} />
        </button>
        <div className="flex flex-col items-center">
          <span className="font-semibold text-stone-900 dark:text-white">Partner</span>
          <div className="flex items-center text-[10px] font-medium" style={{ color: partnerOnline ? 'var(--sage)' : 'var(--muted-text)' }}>
            {partnerTyping ? (
              <span className="italic text-rose-500 animate-pulse">Typing...</span>
            ) : partnerOnline ? (
              "Online"
            ) : (
              "Offline"
            )}
          </div>
        </div>
        <div className="w-10"></div>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-hidden relative" onClick={() => setSelectedMessageId(null)}>
        {!isReady ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-stone-400 space-y-3">
             <Lock className="w-8 h-8 text-stone-300" />
             <p className="text-sm">Securing your space...</p>
          </div>
        ) : (
          <Virtuoso
            ref={virtuosoRef}
            data={messages}
            itemContent={renderMessage}
            followOutput="smooth"
            className="h-full w-full chat-scrollbar"
            atBottomThreshold={100}
            initialTopMostItemIndex={messages.length - 1}
          />
        )}
      </div>

      {/* Input Area */}
      <div className="p-3 bg-white dark:bg-stone-900 border-t border-stone-200 dark:border-stone-800 shrink-0 pb-safe">
        
        {/* Audio Preview Frame */}
        {pendingAudio ? (
           <div className="flex items-center justify-between bg-stone-100 dark:bg-stone-800 p-3 rounded-2xl w-full">
              <button onClick={() => setPendingAudio(null)} className="p-2 bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-300 rounded-full transition-transform active:scale-90">
                 <Trash2 size={18} />
              </button>
              <audio src={`data:audio/aac;base64,${pendingAudio}`} controls className="h-10 mx-2 flex-1 outline-none" />
              <button 
                 onClick={() => sendSecureMessage(pendingAudio, 'voice')}
                 className="p-3 bg-rose-500 shadow-md shadow-rose-500/20 rounded-full text-white transition-all transform active:scale-95"
              >
                 <Send size={18} className="translate-x-0.5" />
              </button>
           </div>
        ) : (
          <div className="flex items-end space-x-2">
            <button 
              onClick={handleVoiceRecord}
              className={`p-3 shrink-0 rounded-full transition-all ${
                isRecording 
                  ? 'bg-rose-500 text-white scale-110 shadow-lg animate-pulse' 
                  : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400'
              }`}
            >
              {isRecording ? <Square size={20} className="fill-current" /> : <Mic size={20} />}
            </button>
            
            <div className="flex-1 bg-stone-100 dark:bg-stone-800 rounded-3xl overflow-hidden flex items-center pr-2">
              <textarea
                value={inputText}
                onChange={(e) => {
                  setInputText(e.target.value);
                  emitTyping();
                }}
                placeholder={isRecording ? "Recording voice..." : "Message"}
                disabled={isRecording}
                className="w-full bg-transparent border-none focus:ring-0 text-stone-900 dark:text-white px-4 py-3 max-h-32 resize-none outline-none disabled:opacity-50"
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendSecureMessage(inputText);
                  }
                }}
              />
              <button 
                onClick={() => sendSecureMessage(inputText)}
                disabled={!inputText.trim() || !isReady}
                className="p-2.5 bg-rose-500 rounded-full text-white disabled:opacity-30 disabled:bg-stone-300 transition-all hover:scale-105 active:scale-95"
              >
                <Send size={16} className="translate-x-0.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
