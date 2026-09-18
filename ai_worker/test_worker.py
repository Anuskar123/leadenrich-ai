import json
import unittest
from unittest.mock import Mock, patch

from worker import ResearchError, draft_email, fetch_website_text, process_lead, public_destination


class WorkerTests(unittest.TestCase):
    def test_rejects_private_dns(self):
        for ip in ['127.0.0.1', '10.0.0.2', '169.254.169.254', '::1']:
            with self.subTest(ip=ip), patch('worker.socket.getaddrinfo', return_value=[(0, 0, 0, '', (ip, 443))]):
                with self.assertRaises(ResearchError):
                    public_destination('https://company.example')

    def test_pins_public_address(self):
        with patch('worker.socket.getaddrinfo', return_value=[(0, 0, 0, '', ('93.184.216.34', 443))]):
            parts, url = public_destination('https://example.com/about?a=1')
        self.assertEqual(parts.hostname, 'example.com')
        self.assertEqual(url, 'https://93.184.216.34/about?a=1')

    def test_rejects_unsafe_scheme_and_credentials(self):
        for url in ['file:///etc/passwd', 'https://user:pass@example.com', 'https://example.com:3000']:
            with self.assertRaises(ResearchError):
                public_destination(url)

    def test_extracts_main_text_without_script(self):
        response = Mock(status_code=200, headers={'Content-Type': 'text/html'})
        response.iter_content.return_value = [b'<html><nav>Navigation</nav><main>' + b'Company provides useful scheduling software. ' * 6 + b'<script>secret</script></main></html>']
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        session = Mock()
        session.__enter__ = Mock(return_value=session)
        session.__exit__ = Mock(return_value=False)
        session.get.return_value = response
        with patch('worker.requests.Session', return_value=session), patch('worker.socket.getaddrinfo', return_value=[(0, 0, 0, '', ('93.184.216.34', 443))]):
            text = fetch_website_text('https://example.com')
        self.assertIn('scheduling', text)
        self.assertNotIn('secret', text)
        self.assertNotIn('Navigation', text)

    def test_draft_has_summary_and_three_parts(self):
        client = Mock()
        client.models.generate_content.return_value.text = json.dumps({
            'companySummary': 'Builds scheduling tools.',
            'emailSentences': ['I noticed your tools.', 'We build software.', 'Could we talk?']})
        summary, email = draft_email(client, 'test', 'https://example.com', 'website')
        self.assertEqual(summary, 'Builds scheduling tools.')
        self.assertEqual(email, 'I noticed your tools. We build software. Could we talk?')

    def test_incomplete_generation_fails(self):
        client = Mock()
        client.models.generate_content.return_value.text = '{"companySummary":"Summary","emailSentences":["One."]}'
        with self.assertRaises(ResearchError):
            draft_email(client, 'test', 'https://example.com', 'website')

    def test_failure_is_saved_without_sensitive_exception(self):
        collection = Mock()
        lead = {'_id': '1', 'id': 'public-id', 'leaseToken': 'token', 'companyUrl': 'https://example.com'}
        with patch('worker.fetch_website_text', side_effect=RuntimeError('secret-api-key')):
            process_lead(collection, lead, Mock(), 'test')
        query, update = collection.update_one.call_args.args
        self.assertEqual(query['leaseToken'], 'token')
        self.assertEqual(update['$set']['status'], 'FAILED')
        self.assertNotIn('secret-api-key', update['$set']['error'])


if __name__ == '__main__':
    unittest.main()
