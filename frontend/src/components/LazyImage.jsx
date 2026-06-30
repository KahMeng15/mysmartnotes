import React, { useEffect, useRef, useState } from 'react';
import { Skeleton } from '@mantine/core';

export const LazyImage = ({ src, alt, title, style, maxWidth, ...props }) => {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const imgRef = useRef(null);

  useEffect(() => {
    if (imgRef.current?.complete) {
      setLoaded(true);
    }
  }, []);

  return (
    <>
      {!loaded && !error && (
        <div style={{ maxWidth: maxWidth || '100%', margin: '1rem 0' }}>
          <Skeleton height={200} width="100%" radius="md" animate />
        </div>
      )}

      {error && (
        <div style={{ maxWidth: maxWidth || '100%', margin: '1rem 0', height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px dashed #ced4da', color: '#868e96' }}>
          Failed to load image
        </div>
      )}

      <img
        ref={imgRef}
        src={src}
        alt={alt}
        title={title}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => {
          setLoaded(true);
          setError(true);
        }}
        style={{
          width: '100%',
          height: 'auto',
          opacity: (loaded && !error) ? 1 : 0,
          position: (loaded && !error) ? 'static' : 'absolute',
          pointerEvents: (loaded && !error) ? 'auto' : 'none',
          maxWidth: maxWidth || '100%',
          borderRadius: '8px',
          margin: (loaded && !error) ? '1rem 0' : 0,
          ...style
        }}
        {...props}
      />
    </>
  );
};
