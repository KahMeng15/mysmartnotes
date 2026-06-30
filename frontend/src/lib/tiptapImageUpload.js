import { Plugin, PluginKey } from 'prosemirror-state';

export const handleImageUploadFlow = async (file, id, endpointPrefix = 'resources') => {
  if (file.size > 5 * 1024 * 1024) {
    alert("File size exceeds 5MB limit.");
    return null;
  }
  if (file.type === "image/gif" || file.type === "image/svg+xml") {
    alert("GIF and SVG formats are not allowed.");
    return null;
  }
  if (!file.type.startsWith("image/")) {
    alert("Only image files are allowed.");
    return null;
  }
  
  const formData = new FormData();
  formData.append('file', file);
  
  const token = localStorage.getItem('token');
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const csrfMatch = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]*)/);
  if (csrfMatch && csrfMatch[1]) {
    headers['X-CSRF-Token'] = decodeURIComponent(csrfMatch[1]);
  }

  try {
    const res = await fetch(`/api/${endpointPrefix}/${id}/upload-image`, {
      method: 'POST',
      headers,
      body: formData
    });
    
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.detail || "Failed to upload image");
      return null;
    }
    const data = await res.json();
    return data.url;
  } catch (e) {
    console.error(e);
    alert("Failed to upload image");
    return null;
  }
};

export const ImageUploadPlugin = (id, endpointPrefix) => {
  return new Plugin({
    key: new PluginKey('imageUpload'),
    props: {
      handlePaste(view, event, slice) {
        const items = Array.from(event.clipboardData?.items || []);
        for (const item of items) {
          if (item.type.indexOf('image') === 0) {
            event.preventDefault();
            const file = item.getAsFile();
            handleImageUploadFlow(file, id, endpointPrefix).then(url => {
              if (url) {
                const { schema } = view.state;
                const node = schema.nodes.image.create({ src: url });
                const transaction = view.state.tr.replaceSelectionWith(node);
                view.dispatch(transaction);
              }
            });
            return true;
          }
        }
        return false;
      },
      handleDrop(view, event, slice, moved) {
        if (!moved && event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]) {
          const file = event.dataTransfer.files[0];
          if (file.type.indexOf('image') === 0) {
            event.preventDefault();
            const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY });
            handleImageUploadFlow(file, id, endpointPrefix).then(url => {
              if (url && coordinates) {
                const { schema } = view.state;
                const node = schema.nodes.image.create({ src: url });
                const transaction = view.state.tr.insert(coordinates.pos, node);
                view.dispatch(transaction);
              }
            });
            return true;
          }
        }
        return false;
      }
    }
  });
};
