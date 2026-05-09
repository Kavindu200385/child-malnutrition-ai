import React, { useEffect, useMemo, useState } from 'react';
import { User } from '../../App';
import { signPagesAPI } from '../../services/api';

interface SignPageUploadViewProps {
  user: User;
}

interface SignPageRecord {
  id: number;
  front_image_path: string;
  back_image_path: string;
  role: string;
  uploaded_by_user_id: number;
  uploaded_by_name?: string;
  created_at?: string;
}

export function SignPageUploadView({ user }: SignPageUploadViewProps) {
  const [frontImage, setFrontImage] = useState<File | null>(null);
  const [backImage, setBackImage] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [records, setRecords] = useState<SignPageRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);

  const frontPreview = useMemo(() => (frontImage ? URL.createObjectURL(frontImage) : ''), [frontImage]);
  const backPreview = useMemo(() => (backImage ? URL.createObjectURL(backImage) : ''), [backImage]);

  useEffect(() => {
    return () => {
      if (frontPreview) URL.revokeObjectURL(frontPreview);
      if (backPreview) URL.revokeObjectURL(backPreview);
    };
  }, [frontPreview, backPreview]);

  const fetchRecords = async () => {
    setLoadingRecords(true);
    try {
      const response = await signPagesAPI.list();
      setRecords(response.data?.records || []);
    } catch (error: any) {
      setFeedback({
        type: 'error',
        message: error?.response?.data?.message || 'Failed to load sign page records.',
      });
    } finally {
      setLoadingRecords(false);
    }
  };

  useEffect(() => {
    const bootstrap = async () => {
      try {
        await signPagesAPI.importSignInPhotos();
      } catch {
        // ignore import errors and still try to load records
      }
      await fetchRecords();
    };
    bootstrap();
  }, []);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!frontImage || !backImage) {
      setFeedback({ type: 'error', message: 'Please select both Front Side and Back Side images.' });
      return;
    }

    const formData = new FormData();
    formData.append('frontImage', frontImage);
    formData.append('backImage', backImage);
    formData.append('role', user.role);

    setSubmitting(true);
    try {
      await signPagesAPI.upload(formData);
      setFeedback({ type: 'success', message: 'Sign page photos uploaded successfully.' });
      setFrontImage(null);
      setBackImage(null);
      await fetchRecords();
    } catch (error: any) {
      setFeedback({
        type: 'error',
        message: error?.response?.data?.message || 'Failed to upload sign page photos.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    setFeedback(null);
    try {
      await signPagesAPI.remove(id);
      setFeedback({ type: 'success', message: 'Sign page record deleted successfully.' });
      await fetchRecords();
    } catch (error: any) {
      setFeedback({
        type: 'error',
        message: error?.response?.data?.message || 'Failed to delete sign page record.',
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-2">Upload Sign Page Photos</h2>
        <p className="text-sm text-gray-600 mb-6">
          Upload both front and back sides of sign page photos. Only admin/superadmin can access this section.
        </p>

        <form onSubmit={handleUpload} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-800 mb-2">Front Side</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setFrontImage(e.target.files?.[0] || null)}
                className="block w-full text-sm text-gray-700 border border-gray-300 rounded-lg p-2"
              />
              {frontPreview && (
                <img src={frontPreview} alt="Front preview" className="mt-3 h-44 w-full object-cover rounded-lg border border-gray-200" />
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-800 mb-2">Back Side</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setBackImage(e.target.files?.[0] || null)}
                className="block w-full text-sm text-gray-700 border border-gray-300 rounded-lg p-2"
              />
              {backPreview && (
                <img src={backPreview} alt="Back preview" className="mt-3 h-44 w-full object-cover rounded-lg border border-gray-200" />
              )}
            </div>
          </div>

          {feedback && (
            <div
              className={`text-sm px-4 py-3 rounded-lg border ${
                feedback.type === 'success'
                  ? 'bg-green-50 border-green-200 text-green-800'
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}
            >
              {feedback.message}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center justify-center min-h-[44px] px-6 py-2.5 rounded-lg bg-purple-600 text-white text-sm sm:text-base font-semibold leading-none whitespace-nowrap hover:bg-purple-700 disabled:opacity-60"
          >
            {submitting ? 'Uploading...' : 'Upload Sign Page Photos'}
          </button>
        </form>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Uploaded Sign Pages</h3>
          <button
            onClick={fetchRecords}
            className="px-3 py-1.5 text-sm rounded-md border border-gray-300 hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>

        {loadingRecords ? (
          <p className="text-sm text-gray-500">Loading records...</p>
        ) : records.length === 0 ? (
          <p className="text-sm text-gray-500">No sign page records uploaded yet.</p>
        ) : (
          <div className="space-y-4">
            {records.map((record) => (
              <div key={record.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex flex-wrap items-center gap-3 justify-between mb-3">
                  <div className="text-sm text-gray-700">
                    <span className="font-medium">Uploaded by:</span> {record.uploaded_by_name || `User #${record.uploaded_by_user_id}`} |{' '}
                    <span className="font-medium">Role:</span> {record.role} |{' '}
                    <span className="font-medium">Created:</span> {record.created_at ? new Date(record.created_at).toLocaleString() : '-'}
                  </div>
                  {user.is_protected && (
                    <button
                      onClick={() => handleDelete(record.id)}
                      className="px-3 py-1.5 text-sm rounded-md bg-red-600 text-white hover:bg-red-700"
                    >
                      Delete
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Front Side</p>
                    <img src={record.front_image_path} alt="Front side" className="h-44 w-full object-cover rounded-md border border-gray-200" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Back Side</p>
                    <img src={record.back_image_path} alt="Back side" className="h-44 w-full object-cover rounded-md border border-gray-200" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

