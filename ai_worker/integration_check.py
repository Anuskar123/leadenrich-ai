"""Called by the Node integration check against a uniquely named test database."""
import os
from datetime import datetime, timedelta, timezone
from unittest.mock import Mock, patch

from pymongo import MongoClient
from worker import claim_lead, process_lead

database = os.environ['MONGODB_DB']
assert database.startswith('leadenrich_test_'), 'Only a dedicated test database is allowed'
with MongoClient(os.environ['MONGODB_URI']) as mongo:
    collection = mongo[database]['leads']
    lead = claim_lead(collection)
    assert lead and lead['status'] == 'PROCESSING'
    assert claim_lead(collection) is None, 'Active lease must prevent a second claim'
    collection.update_one({'_id': lead['_id']}, {'$set': {
        'leaseExpiresAt': datetime.now(timezone.utc) - timedelta(seconds=1)}})
    recovered = claim_lead(collection)
    assert recovered['leaseToken'] != lead['leaseToken']
    client = Mock()
    client.models.generate_content.return_value.text = (
        '{"companySummary":"Example builds scheduling tools.",'
        '"emailSentences":["I noticed your scheduling tools.",'
        '"We offer software development services to improve booking workflows.",'
        '"Would a short call be useful?"]}'
    )
    with patch('worker.fetch_website_text', return_value='Example builds scheduling tools.'):
        process_lead(collection, lead, client, 'test-model')
        assert collection.find_one({'_id': lead['_id']})['status'] == 'PROCESSING'
        process_lead(collection, recovered, client, 'test-model')
    assert collection.find_one({'_id': lead['_id']})['status'] == 'COMPLETED'
