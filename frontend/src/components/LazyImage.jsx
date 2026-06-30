import React, { useState } from 'react';
import { Skeleton } from '@mantine/core';

export const LazyImage = ({ src, alt, title, style, maxWidth, ...props }) => {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  return (
    <div style={{ maxWidth: maxWidth || '100%', margin: '1rem 0' }}>
      {!loaded && !error && (
        <Skeleton height={200} width="100%" radius="md" animate />
      )}
      
      {error && (
        <div style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px dashed #ced4da', color: '#868e96' }}>
          Failed to load image
        </div>
      )}

      <img
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
          display: loaded && !error ? 'block' : 'none',
          borderRadius: '8px',
          ...style
        }}
        {...props}
      />
    </div>
  );
};
