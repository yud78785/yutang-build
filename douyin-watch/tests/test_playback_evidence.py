import unittest
from playback_evidence import media_advance,preview_verified,frame_fraction

class PlaybackEvidenceTests(unittest.TestCase):
    @staticmethod
    def probe(t,paused=False,ready=4):
        return {'current_time':t,'paused':paused,'ready_state':ready}

    def test_real_forward_media_counts(self):
        self.assertEqual(media_advance(self.probe(0),self.probe(1),1),1)
        self.assertEqual(media_advance(self.probe(2),self.probe(3.25),1),1.25)

    def test_paused_or_buffering_never_count(self):
        self.assertEqual(media_advance(self.probe(0,True),self.probe(1),1),0)
        self.assertEqual(media_advance(self.probe(0),self.probe(1,True),1),0)
        self.assertEqual(media_advance(self.probe(0,ready=1),self.probe(1),1),0)

    def test_seek_and_invalid_timestamps_do_not_count(self):
        self.assertEqual(media_advance(self.probe(0),self.probe(1800),1),0)
        self.assertEqual(media_advance(self.probe(6),self.probe(0),1),0)
        self.assertEqual(media_advance(self.probe(0),self.probe(float('nan')),1),0)
        self.assertEqual(media_advance(self.probe(0),self.probe(1),0),0)

    def test_preview_requires_multiple_samples(self):
        self.assertFalse(preview_verified(8,8,1))
        self.assertTrue(preview_verified(8,8,8))
        self.assertFalse(preview_verified(0,8,100))

    def test_long_video_preview_sampling_window(self):
        self.assertEqual(frame_fraction(8,2267,4,8,'preview'),0.5)
        self.assertAlmostEqual(frame_fraction(1133.5,2267,4,8,'full'),0.5)

    def test_preview_threshold_and_mode_rejection(self):
        from agent_core import WatchConfig
        self.assertEqual(WatchConfig().watch_mode,'full')
        self.assertEqual(WatchConfig(watch_mode='preview').preview_seconds,8)
        for mode in ('auto','random',''):
            with self.assertRaises(ValueError):WatchConfig(watch_mode=mode)
        with self.assertRaises(ValueError):WatchConfig(preview_seconds=2)
