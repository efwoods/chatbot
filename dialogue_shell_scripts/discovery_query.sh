#knowledge graphs cost $1000/instance/month
curl -u "96fb482b-5536-4c86-883a-f317260ed77b":"qYcIYWgIBfFT" -H 'content-type: application/json' -d '{
       "feature": "disambiguate"
       "entity": {
         "text": "Steve",
         "type": "Person"
       },
       "context": {
         "text": "iphone"
       },
       "count": 100
     }' "https://gateway.watsonplatform.net/discovery/api/v1/environments/d597b7e4-3b37-4886-b950-cb1271dc4d96/collections/eced019a-bbeb-498e-bfe9-ee072ec9a7d5/query_entities?version=2018-03-05"
