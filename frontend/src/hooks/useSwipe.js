import { useRef, useCallback } from 'react';

const THRESHOLD = 80;

export function useSwipe({ onLike, onDislike, locked }) {
  const startX = useRef(0);
  const startY = useRef(0);
  const currentX = useRef(0);
  const cardRef = useRef(null);
  const isDragging = useRef(false);
  
  const scrubTimerRef = useRef(null);
  const isScrubbingRef = useRef(false);
  const scrubStartX = useRef(0);

  const getCard = () => cardRef.current;

  function applyTransform(x) {
    const card = getCard();
    if (!card) return;
    const rotate = (x / window.innerWidth) * 18;
    card.style.transform = `translateX(${x}px) rotate(${rotate}deg)`;

    const likeEl   = card.querySelector('.vote-overlay.like');
    const dislikeEl = card.querySelector('.vote-overlay.dislike');
    const ratio = Math.min(Math.abs(x) / THRESHOLD, 1);
    
    if (x > 0) {
      if (dislikeEl) dislikeEl.style.opacity = ratio;
      if (likeEl)    likeEl.style.opacity = 0;
    } else {
      if (likeEl)    likeEl.style.opacity = ratio;
      if (dislikeEl) dislikeEl.style.opacity = 0;
    }
  }

  function resetCard(animate = true) {
    const card = getCard();
    if (!card) return;
    
    if (animate) {
      card.classList.add('flying');
    } else {
      card.classList.remove('flying');
      card.classList.remove('dragging');
      // Temporarily disable all transitions to stop the base 0.08s transition
      card.style.transition = 'none';
    }
    
    card.style.transform = '';
    card.style.opacity = '1';
    
    const likeEl = card.querySelector('.vote-overlay.like');
    const dislikeEl = card.querySelector('.vote-overlay.dislike');
    
    if (!animate) {
      // Disable transition on overlays so they hide instantly too
      if (likeEl) likeEl.style.transition = 'none';
      if (dislikeEl) dislikeEl.style.transition = 'none';
    }
    
    if (likeEl) likeEl.style.opacity = 0;
    if (dislikeEl) dislikeEl.style.opacity = 0;
    
    if (animate) {
      setTimeout(() => card?.classList.remove('flying'), 450);
    } else {
      // Force repaint to lock in the non-animated transform, then restore transitions
      void card.offsetWidth;
      card.style.transition = '';
      if (likeEl) likeEl.style.transition = '';
      if (dislikeEl) dislikeEl.style.transition = '';
    }
  }

  function flyOut(direction) {
    const card = getCard();
    if (!card) return;
    card.classList.add('flying');
    const flyX = direction === 'right' ? window.innerWidth * 1.5 : -window.innerWidth * 1.5;
    card.style.transform = `translateX(${flyX}px) rotate(${direction === 'right' ? 30 : -30}deg)`;
    card.style.opacity = '0';
  }

  const onPointerDown = useCallback((e) => {
    if (locked) return;
    isDragging.current = true;
    isScrubbingRef.current = false;
    
    const cx = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const cy = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
    startX.current = cx;
    startY.current = cy;
    
    const card = getCard();
    if (card) {
      card.classList.add('dragging');
      
      scrubTimerRef.current = setTimeout(() => {
        if (!isDragging.current) return;
        isScrubbingRef.current = true;
        scrubStartX.current = startX.current;
        card.dispatchEvent(new CustomEvent('scrubstart', { detail: { clientX: startX.current } }));
        if (navigator.vibrate) navigator.vibrate(50);
      }, 300);
    }
  }, [locked]);

  const onPointerMove = useCallback((e) => {
    if (!isDragging.current || locked) return;
    const clientX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    
    if (isScrubbingRef.current) {
      const card = getCard();
      if (card) card.dispatchEvent(new CustomEvent('scrubmove', { detail: { clientX } }));
      return;
    }

    currentX.current = clientX - startX.current;
    
    if (Math.abs(currentX.current) > 15 && scrubTimerRef.current) {
      clearTimeout(scrubTimerRef.current);
    }

    applyTransform(currentX.current);
  }, [locked]);

  const onPointerUp = useCallback(() => {
    if (scrubTimerRef.current) clearTimeout(scrubTimerRef.current);
    
    if (isScrubbingRef.current) {
      isScrubbingRef.current = false;
      const card = getCard();
      if (card) {
         card.classList.remove('dragging');
         card.dispatchEvent(new CustomEvent('scrubend'));
      }
      isDragging.current = false;
      return;
    }

    if (!isDragging.current) return;
    isDragging.current = false;
    const card = getCard();
    if (card) card.classList.remove('dragging');

    const delta = currentX.current;
    currentX.current = 0;

    if (!locked && delta > THRESHOLD) {
      flyOut('right');
      setTimeout(() => onDislike?.(), 200);
    } else if (!locked && delta < -THRESHOLD) {
      flyOut('left');
      setTimeout(() => onLike?.(), 200);
    } else {
      resetCard(true);
    }
  }, [locked, onLike, onDislike]);

  return {
    cardRef,
    handlers: {
      onMouseDown: onPointerDown,
      onMouseMove: onPointerMove,
      onMouseUp: onPointerUp,
      onMouseLeave: onPointerUp,
      onTouchStart: (e) => onPointerDown(e.touches[0]),
      onTouchMove: (e) => { e.preventDefault(); onPointerMove(e.touches[0]); },
      onTouchEnd: onPointerUp,
    },
    flyOut,
    resetCard,
  };
}
